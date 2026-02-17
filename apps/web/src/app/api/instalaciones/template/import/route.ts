import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { addAuditPayload, parseCell, unflattenObject } from "@/lib/instalacionesTemplate";

export const runtime = "nodejs";

type ImportBody = {
  rows: Record<string, any>[];
  dryRun?: boolean;
  allowCreate?: boolean;
};

const RX_YMD = /^\d{4}-\d{2}-\d{2}$/;
const RX_HM = /^\d{2}:\d{2}$/;

function pickDocId(row: Record<string, any>) {
  const codigo = String(row.codigoCliente || row.id || "").trim();
  if (codigo) return codigo;
  return "";
}

function sanitizeRow(row: Record<string, any>) {
  const out: Record<string, any> = {};
  Object.entries(row).forEach(([k, v]) => {
    if (k === "id" || k === "codigoCliente") return;
    const parsed = parseCell(v);
    if (parsed === undefined) return;
    out[k] = parsed;
  });
  return out;
}

function validateRow(id: string, flat: Record<string, any>) {
  const issues: string[] = [];
  const ordenCode = String(flat["orden.codiSeguiClien"] ?? "").trim();
  if (ordenCode && ordenCode !== id) issues.push("orden.codiSeguiClien != codigoCliente");

  const ymdKeys = [
    "fechaOrdenYmd",
    "fechaInstalacionYmd",
    "orden.fechaFinVisiYmd",
    "orden.fechaIniVisiYmd",
    "orden.fSoliYmd",
    "liquidacion.ymd",
  ];
  ymdKeys.forEach((k) => {
    const v = flat[k];
    if (v === undefined) return;
    const s = String(v).trim();
    if (s && !RX_YMD.test(s)) issues.push(`${k} formato invalido`);
  });

  const hmKeys = [
    "fechaInstalacionHm",
    "orden.fechaFinVisiHm",
    "orden.fechaIniVisiHm",
    "orden.fSoliHm",
    "liquidacion.hm",
  ];
  hmKeys.forEach((k) => {
    const v = flat[k];
    if (v === undefined) return;
    const s = String(v).trim();
    if (s && !RX_HM.test(s)) issues.push(`${k} formato invalido`);
  });

  return issues;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json()) as ImportBody;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const dryRun = !!body?.dryRun;
    const allowCreate = !!body?.allowCreate;

    if (!rows.length) return NextResponse.json({ ok: false, error: "NO_ROWS" }, { status: 400 });

    const ids = rows.map(pickDocId).filter(Boolean);
    const uniqueIds = Array.from(new Set(ids));

    const exists = new Set<string>();
    for (let i = 0; i < uniqueIds.length; i += 500) {
      const chunk = uniqueIds.slice(i, i + 500);
      const refs = chunk.map((id) => adminDb().collection("instalaciones").doc(id));
      const snaps = await adminDb().getAll(...refs);
      snaps.forEach((s) => {
        if (s.exists) exists.add(s.id);
      });
    }

    const summary = {
      total: rows.length,
      updated: 0,
      created: 0,
      skippedNoId: 0,
      skippedMissing: 0,
      skippedEmpty: 0,
      skippedInvalid: 0,
    };
    const invalidDetails: Array<{ id: string; issues: string[] }> = [];

    if (dryRun) {
      rows.forEach((r) => {
        const id = pickDocId(r);
        if (id.toUpperCase().startsWith("EJEMPLO")) {
          summary.skippedEmpty += 1;
          return;
        }
        if (!id) {
          summary.skippedNoId += 1;
          return;
        }
        const flat = sanitizeRow(r);
        if (!Object.keys(flat).length) {
          summary.skippedEmpty += 1;
          return;
        }
        const issues = validateRow(id, flat);
        if (issues.length) {
          summary.skippedInvalid += 1;
          if (invalidDetails.length < 20) invalidDetails.push({ id, issues });
          return;
        }
        const isExisting = exists.has(id);
        if (!isExisting && !allowCreate) {
          summary.skippedMissing += 1;
          return;
        }
        if (isExisting) summary.updated += 1;
        else summary.created += 1;
      });
      return NextResponse.json({ ok: true, dryRun: true, summary, invalidDetails });
    }

    const writes: { id: string; payload: Record<string, any>; creating: boolean }[] = [];
    rows.forEach((r) => {
      const id = pickDocId(r);
      if (id.toUpperCase().startsWith("EJEMPLO")) {
        summary.skippedEmpty += 1;
        return;
      }
      if (!id) {
        summary.skippedNoId += 1;
        return;
      }
      const flat = sanitizeRow(r);
      if (!Object.keys(flat).length) {
        summary.skippedEmpty += 1;
        return;
      }
      const issues = validateRow(id, flat);
      if (issues.length) {
        summary.skippedInvalid += 1;
        if (invalidDetails.length < 20) invalidDetails.push({ id, issues });
        return;
      }
      const isExisting = exists.has(id);
      if (!isExisting && !allowCreate) {
        summary.skippedMissing += 1;
        return;
      }
      const unflat = unflattenObject(flat);
      const payload = addAuditPayload(unflat, session.uid);
      writes.push({ id, payload, creating: !isExisting });
    });

    for (let i = 0; i < writes.length; i += 400) {
      const batch = adminDb().batch();
      writes.slice(i, i + 400).forEach((w) => {
        const ref = adminDb().collection("instalaciones").doc(w.id);
        batch.set(ref, w.payload, { merge: true });
      });
      await batch.commit();
    }

    writes.forEach((w) => {
      if (w.creating) summary.created += 1;
      else summary.updated += 1;
    });

    return NextResponse.json({ ok: true, summary, invalidDetails });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
