import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getOpenAIClient } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EQUIPOS = ["ONT", "MESH", "FONO", "BOX"] as const;
type Eq = (typeof EQUIPOS)[number];
type Counts = Record<Eq, number>;
type Scope = "all" | "coordinador" | "tecnico";

const CountsSchema = z
  .object({
    ONT: z.number().finite().min(0),
    MESH: z.number().finite().min(0),
    FONO: z.number().finite().min(0),
    BOX: z.number().finite().min(0),
  })
  .strict();

const RowSchema = z
  .object({
    cuadrillaId: z.string().min(1),
    nombre: z.string().optional(),
    coordinadorUid: z.string().optional(),
    coordinadorNombre: z.string().optional(),
    stock: CountsSchema,
    consumo: CountsSchema,
    promedio: CountsSchema,
    omitida: z.boolean().optional().default(false),
  })
  .strict();

const RequestSchema = z
  .object({
    anchor: z.string().min(1),
    modelFilter: z.enum(["all", "huawei", "zte"]).optional().default("all"),
    objetivo: CountsSchema,
    stockAlmacen: CountsSchema,
    rows: z.array(RowSchema).min(1).max(2500),
  })
  .strict();

const AiRawResponseSchema = z
  .object({
    byCuadrilla: z.record(z.string(), CountsSchema),
  })
  .strict();

const AI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    byCuadrilla: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          ONT: { type: "number", minimum: 0 },
          MESH: { type: "number", minimum: 0 },
          FONO: { type: "number", minimum: 0 },
          BOX: { type: "number", minimum: 0 },
        },
        required: ["ONT", "MESH", "FONO", "BOX"],
      },
    },
  },
  required: ["byCuadrilla"],
} as const;

function zeroCounts(): Counts {
  return { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
}

function toInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function createRequestId() {
  return `ai_pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveRequestId() {
  try {
    const h = await headers();
    const fromHeader =
      h.get("x-request-id") ||
      h.get("x-correlation-id") ||
      h.get("x-vercel-id") ||
      h.get("traceparent");
    if (fromHeader) return String(fromHeader);
  } catch {}
  return createRequestId();
}

function aiMetricsLog(payload: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(payload);
  } catch {}
}

function resolveScope(roles: string[], isAdmin: boolean): Scope {
  const isPrivileged =
    isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("ALMACEN") ||
    roles.includes("RRHH");
  if (isPrivileged) return "all";
  if (roles.includes("COORDINADOR")) return "coordinador";
  if (roles.includes("TECNICO")) return "tecnico";
  return "all";
}

function capByStock(base: Record<string, Counts>, stockAlmacen: Counts, omitidas: Record<string, boolean>) {
  const out: Record<string, Counts> = {};
  for (const [id, v] of Object.entries(base)) {
    out[id] = {
      ONT: toInt(v.ONT),
      MESH: toInt(v.MESH),
      FONO: toInt(v.FONO),
      BOX: toInt(v.BOX),
    };
    if (omitidas[id]) out[id] = zeroCounts();
  }

  const cappedMaterials: Eq[] = [];
  const activeIds = Object.keys(out).filter((id) => !omitidas[id]);

  for (const k of EQUIPOS) {
    const need = activeIds.reduce((acc, id) => acc + toInt(out[id][k]), 0);
    const available = toInt(stockAlmacen[k]);
    if (need <= available) continue;
    cappedMaterials.push(k);

    let assigned = 0;
    for (const id of activeIds) {
      const ideal = toInt(out[id][k]);
      const quota = need > 0 ? Math.floor((ideal / need) * available) : 0;
      out[id][k] = quota;
      assigned += quota;
    }

    let rem = available - assigned;
    for (const id of activeIds) {
      if (!rem) break;
      out[id][k] += 1;
      rem -= 1;
    }
  }

  return { out, cappedMaterials };
}

function buildDeterministicSuggestion(input: z.infer<typeof RequestSchema>) {
  const result: Record<string, Counts> = {};
  const omitidas: Record<string, boolean> = {};
  for (const row of input.rows) {
    omitidas[row.cuadrillaId] = !!row.omitida;
    if (row.omitida) {
      result[row.cuadrillaId] = zeroCounts();
      continue;
    }
    result[row.cuadrillaId] = {
      ONT: Math.max(0, Math.ceil(Math.max(toInt(input.objetivo.ONT), toInt(row.promedio.ONT)) - toInt(row.stock.ONT))),
      MESH: Math.max(0, Math.ceil(Math.max(toInt(input.objetivo.MESH), toInt(row.promedio.MESH)) - toInt(row.stock.MESH))),
      FONO: Math.max(0, Math.ceil(Math.max(toInt(input.objetivo.FONO), toInt(row.promedio.FONO)) - toInt(row.stock.FONO))),
      BOX: Math.max(0, Math.ceil(Math.max(toInt(input.objetivo.BOX), toInt(row.promedio.BOX)) - toInt(row.stock.BOX))),
    };
  }
  return capByStock(result, input.stockAlmacen, omitidas);
}

function normalizeAiSuggestion(
  input: z.infer<typeof RequestSchema>,
  raw: z.infer<typeof AiRawResponseSchema>
) {
  const knownIds = new Set(input.rows.map((r) => r.cuadrillaId));
  const omitidas: Record<string, boolean> = {};
  for (const r of input.rows) omitidas[r.cuadrillaId] = !!r.omitida;

  const unknownIdsDropped: string[] = [];
  const merged: Record<string, Counts> = {};
  for (const row of input.rows) {
    const aiRow = raw.byCuadrilla[row.cuadrillaId];
    merged[row.cuadrillaId] = aiRow
      ? {
          ONT: toInt(aiRow.ONT),
          MESH: toInt(aiRow.MESH),
          FONO: toInt(aiRow.FONO),
          BOX: toInt(aiRow.BOX),
        }
      : zeroCounts();
  }

  for (const key of Object.keys(raw.byCuadrilla)) {
    if (!knownIds.has(key)) unknownIdsDropped.push(key);
  }

  const capped = capByStock(merged, input.stockAlmacen, omitidas);
  return {
    byCuadrilla: capped.out,
    cappedMaterials: capped.cappedMaterials,
    unknownIdsDropped,
  };
}

function computeTotal(byCuadrilla: Record<string, Counts>) {
  const total = zeroCounts();
  for (const v of Object.values(byCuadrilla)) {
    total.ONT += toInt(v.ONT);
    total.MESH += toInt(v.MESH);
    total.FONO += toInt(v.FONO);
    total.BOX += toInt(v.BOX);
  }
  return total;
}

function buildAiPrompt(input: z.infer<typeof RequestSchema>) {
  const payload = {
    anchor: input.anchor,
    modelFilter: input.modelFilter,
    objetivo: input.objetivo,
    stockAlmacen: input.stockAlmacen,
    rows: input.rows.map((r) => ({
      cuadrillaId: r.cuadrillaId,
      nombre: r.nombre || r.cuadrillaId,
      stock: r.stock,
      consumo: r.consumo,
      promedio: r.promedio,
      omitida: !!r.omitida,
    })),
  };

  return [
    "Devuelve SOLO JSON valido con formato:",
    '{"byCuadrilla":{"CUADRILLA_ID":{"ONT":0,"MESH":0,"FONO":0,"BOX":0}}}',
    "Reglas:",
    "1) Solo ids presentes en rows.",
    "2) Enteros >= 0.",
    "3) Si omitida=true, todos 0.",
    "4) Usa objetivo, consumo, promedio y stock para recomendar.",
    "5) No incluyas explicaciones ni texto adicional.",
    `DATA=${JSON.stringify(payload)}`,
  ].join("\n");
}

function extractJsonPayload(rawText: string): unknown | null {
  const text = String(rawText || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const md = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
  if (md?.[1]) {
    try {
      return JSON.parse(md[1].trim());
    } catch {}
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

async function requestAiStructuredJson(input: z.infer<typeof RequestSchema>, model: string, retry = false) {
  const extra = retry
    ? "\nRESPONDE SOLO JSON VALIDO Y NADA MAS. NO markdown, NO texto fuera del JSON."
    : "";
  const finalInput = `${buildAiPrompt(input)}${extra}`;
  const openai = getOpenAIClient();
  try {
    return await openai.responses.create({
      model,
      input: finalInput,
      // Structured output para reducir al minimo respuestas no parseables.
      text: {
        format: {
          type: "json_schema",
          name: "predespacho_recommendation",
          schema: AI_RESPONSE_JSON_SCHEMA,
          strict: true,
        },
      } as any,
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    // Algunos entornos/modelos rechazan json_schema aunque soporte Responses API.
    if (msg.includes("Invalid schema for response_format")) {
      return openai.responses.create({
        model,
        input: finalInput,
      });
    }
    throw e;
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = await resolveRequestId();
  const model = process.env.PREDESPACHO_AI_MODEL || "gpt-4.1-mini";
  try {
    const session = await getServerSession({ requestId });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse =
      session.isAdmin ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      roles.includes("COORDINADOR") ||
      roles.includes("TECNICO") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("EQUIPOS_VIEW");
    if (!canUse) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const parsedReq = RequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsedReq.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }
    const input = parsedReq.data;

    const scope = resolveScope(roles, session.isAdmin);
    const db = adminDb();
    const cqSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .select(
        "estado",
        "coordinadorUid",
        "coordinadoraUid",
        "coordinadorId",
        "coordinadoraId",
        "tecnicosUids",
        "tecnicosIds",
        "tecnicos"
      )
      .limit(2500)
      .get();

    let allowedRows = cqSnap.docs
      .map((d) => {
        const x = (d.data() || {}) as any;
        const estado = String(x?.estado || "").toUpperCase();
        const coordUid = String(
          x?.coordinadorUid || x?.coordinadoraUid || x?.coordinadorId || x?.coordinadoraId || ""
        ).trim();
        const tecnicos = Array.from(
          new Set([
            ...(Array.isArray(x?.tecnicosUids) ? x.tecnicosUids : []),
            ...(Array.isArray(x?.tecnicosIds) ? x.tecnicosIds : []),
            ...(Array.isArray(x?.tecnicos) ? x.tecnicos : []),
          ])
        )
          .map((v) => String(v || "").trim())
          .filter(Boolean);
        return {
          id: d.id,
          estado,
          coordinadorUid: coordUid,
          tecnicosUids: tecnicos,
        };
      })
      .filter((c) => !c.estado || c.estado === "HABILITADO" || c.estado === "ACTIVO" || c.estado === "ACTIVA");

    if (scope === "coordinador") {
      allowedRows = allowedRows.filter((c) => c.coordinadorUid === session.uid);
    } else if (scope === "tecnico") {
      allowedRows = allowedRows.filter((c) => c.tecnicosUids.includes(session.uid));
    }

    const allowedIds = new Set(allowedRows.map((c) => c.id));
    const unknownInputIds = input.rows
      .map((r) => r.cuadrillaId)
      .filter((id) => !allowedIds.has(id));
    if (unknownInputIds.length) {
      return NextResponse.json({ ok: false, error: "UNKNOWN_CUADRILLA_IDS" }, { status: 400 });
    }

    const deterministic = buildDeterministicSuggestion(input);
    let status: "ok" | "fallback" = "fallback";
    let source: "openai" | "deterministic" = "deterministic";
    let byCuadrilla = deterministic.out;
    let cappedMaterials = deterministic.cappedMaterials;
    let unknownIdsDropped: string[] = [];
    let parseStatus: "ok" | "invalid_json" | "invalid_schema" | "provider_error" = "provider_error";

    try {
      const aiStarted = Date.now();
      let rawJson: unknown | null = null;
      let parsedAi: ReturnType<typeof AiRawResponseSchema.safeParse> | null = null;
      let lastParseError = "AI_INVALID_JSON";

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const resp = await requestAiStructuredJson(input, model, attempt === 2);
        const rawText = String(resp.output_text || "").trim();
        rawJson = extractJsonPayload(rawText);
        if (!rawJson) {
          parseStatus = "invalid_json";
          lastParseError = "AI_INVALID_JSON";
          continue;
        }
        parsedAi = AiRawResponseSchema.safeParse(rawJson);
        if (!parsedAi.success) {
          parseStatus = "invalid_schema";
          lastParseError = "AI_INVALID_SCHEMA";
          continue;
        }
        parseStatus = "ok";
        break;
      }

      if (!parsedAi || !parsedAi.success) {
        throw new Error(lastParseError);
      }

      const normalized = normalizeAiSuggestion(input, parsedAi.data);
      byCuadrilla = normalized.byCuadrilla;
      cappedMaterials = normalized.cappedMaterials;
      unknownIdsDropped = normalized.unknownIdsDropped;
      status = "ok";
      source = "openai";

      aiMetricsLog({
        tag: "ai_metrics",
        kind: "predespacho_recommendation",
        requestId,
        nodeEnv: process.env.NODE_ENV,
        model,
        stage: "openai_call",
        durationMs: Date.now() - aiStarted,
        status: "ok",
      });
    } catch (aiErr: any) {
      aiMetricsLog({
        tag: "ai_metrics",
        kind: "predespacho_recommendation",
        requestId,
        nodeEnv: process.env.NODE_ENV,
        model,
        stage: "openai_call",
        durationMs: Date.now() - startedAt,
        status: "error",
        parseStatus,
        error: String(aiErr?.message || "AI_ERROR"),
      });
    }

    const total = computeTotal(byCuadrilla);
    const latencyMs = Date.now() - startedAt;

    aiMetricsLog({
      tag: "ai_metrics",
      kind: "predespacho_recommendation",
      requestId,
      nodeEnv: process.env.NODE_ENV,
      model,
      status,
      source,
      parseStatus,
      rowsCount: input.rows.length,
      scope,
      cappedMaterials,
      unknownIdsDroppedCount: unknownIdsDropped.length,
      latencyMs,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      status,
      recommendation: {
        byCuadrilla,
        total,
      },
      meta: {
        source,
        model,
        scope,
        latencyMs,
        generatedAt: new Date().toISOString(),
        cappedMaterials,
        unknownIdsDropped,
      },
    });
  } catch (e: any) {
    aiMetricsLog({
      tag: "ai_metrics",
      kind: "predespacho_recommendation",
      requestId,
      nodeEnv: process.env.NODE_ENV,
      status: "error",
      latencyMs: Date.now() - startedAt,
      error: String(e?.message || "ERROR"),
    });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
