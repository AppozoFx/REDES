import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type OrdenAuditRow = {
  pedido: string;
  cliente: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  coordinadorId: string;
  coordinador: string;
  ymd: string;
  ordenId: string;
};

type PreliqAuditRow = {
  id: string;
  pedido: string;
  cliente: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  coordinadorId?: string;
  coordinador?: string;
  ymd: string;
  fromId: string;
  contacto: {
    documento: string;
    nombres: string;
    telefono: string;
  };
  normalized: {
    documento: string;
    nombres: string;
    telefono: string;
  };
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentLimaMonth() {
  return todayLimaYmd().slice(0, 7);
}

function monthRange(monthRaw: string): { start: string; end: string } | null {
  const m = String(monthRaw || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  const start = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mm, 0).getDate();
  const end = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function cleanValue(value: unknown): string {
  return String(value || "").trim();
}

function normalizeDigits(value: unknown): string {
  return cleanValue(value).replace(/\D/g, "");
}

function normalizeAuditName(value: unknown): string {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function preliqOrderKey(pedido: string, ymd: string): string {
  return `${cleanValue(pedido)}__${cleanValue(ymd)}`;
}

function shortName(name: string) {
  const parts = cleanValue(name)
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function isFinalizada(estado: unknown) {
  return cleanValue(estado).toUpperCase() === "FINALIZADA";
}

function isGarantiaRow(row: Record<string, unknown>) {
  return `${cleanValue(row.tipo)} ${cleanValue(row.tipoTraba)} ${cleanValue(row.idenServi)} ${cleanValue(
    row.estado
  )}`
    .toUpperCase()
    .includes("GARANTIA");
}

async function collectOrdenes(params: { ymd?: string; month?: string }): Promise<OrdenAuditRow[]> {
  const db = adminDb();
  const q = db.collection("ordenes");
  const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
  const collect = (snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => {
    for (const d of snap.docs) docsById.set(d.id, d);
  };

  const collectExactYmd = async (field: "fSoliYmd" | "fechaFinVisiYmd", value: string) => {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
    while (true) {
      let query = q.where(field, "==", value).orderBy(field).limit(2000);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      collect(snap);
      if (snap.size < 2000) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  };

  const collectMonthRange = async (
    field: "fSoliYmd" | "fechaFinVisiYmd",
    start: string,
    end: string
  ) => {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
    while (true) {
      let query = q.where(field, ">=", start).where(field, "<=", end).orderBy(field).limit(2000);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      collect(snap);
      if (snap.size < 2000) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  };

  if (params.ymd) {
    await collectExactYmd("fSoliYmd", params.ymd);
    await collectExactYmd("fechaFinVisiYmd", params.ymd);
  } else {
    const range = monthRange(params.month || currentLimaMonth())!;
    await collectMonthRange("fSoliYmd", range.start, range.end);
    await collectMonthRange("fechaFinVisiYmd", range.start, range.end);
  }

  const rows = Array.from(docsById.values())
    .map((doc) => {
      const row = (doc.data() || {}) as Record<string, unknown>;
      return {
        pedido: cleanValue(row.codiSeguiClien || row.ordenId || ""),
        cliente: cleanValue(row.cliente || ""),
        cuadrillaId: cleanValue(row.cuadrillaId || ""),
        cuadrillaNombre: cleanValue(row.cuadrillaNombre || ""),
        coordinadorId: cleanValue(row.coordinadorCuadrilla || row.coordinador || row.gestorCuadrilla || ""),
        coordinador: "",
        ymd: cleanValue(row.fechaFinVisiYmd || row.fSoliYmd || ""),
        ordenId: cleanValue(row.ordenId || doc.id),
        _raw: row,
      };
    })
    .filter((row) => !!row.pedido && !!row.ymd && !!row.cuadrillaId)
    .filter((row) => isFinalizada(row._raw.estado))
    .filter((row) => !isGarantiaRow(row._raw))
    .map(({ _raw, ...row }) => row);

  const coordinatorIds = Array.from(new Set(rows.map((row) => row.coordinadorId).filter(Boolean)));
  const coordinatorRefs = coordinatorIds.map((uid) => db.collection("usuarios").doc(uid));
  const coordinatorSnaps = coordinatorRefs.length ? await db.getAll(...coordinatorRefs) : [];
  const coordinatorMap = new Map(
    coordinatorSnaps.map((snap, i) => {
      const fallback = coordinatorIds[i] || snap.id;
      const data = (snap.data() || {}) as Record<string, unknown>;
      const nombres = cleanValue(data.nombres);
      const apellidos = cleanValue(data.apellidos);
      const full = cleanValue(`${nombres} ${apellidos}`) || fallback;
      return [fallback, shortName(full) || fallback];
    })
  );

  return rows.map((row) => ({
    ...row,
    coordinador: coordinatorMap.get(row.coordinadorId) || shortName(row.coordinadorId) || row.coordinadorId,
  }));
}

async function collectPreliquidaciones(params: { ymd?: string; month?: string }): Promise<PreliqAuditRow[]> {
  const db = adminDb();
  const q = db.collection("telegram_preliquidaciones");
  const docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];

  if (params.ymd) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
    while (true) {
      let query = q.where("ymd", "==", params.ymd).orderBy("ymd").limit(2000);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      docs.push(...snap.docs);
      if (snap.size < 2000) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  } else {
    const range = monthRange(params.month || currentLimaMonth())!;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
    while (true) {
      let query = q.where("ymd", ">=", range.start).where("ymd", "<=", range.end).orderBy("ymd").limit(2000);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      docs.push(...snap.docs);
      if (snap.size < 2000) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  return docs.map((doc) => {
    const row = (doc.data() || {}) as Record<string, unknown>;
    const pre = ((row.preliquidacion || {}) as Record<string, unknown>) || {};
    const documento = cleanValue(pre.receptorDocumento);
    const nombres = cleanValue(pre.receptorNombres);
    const telefono = cleanValue(pre.receptorTelefono);
    return {
      id: doc.id,
      pedido: cleanValue(row.pedido || ""),
      cliente: cleanValue(row.cliente || ""),
      cuadrillaId: cleanValue(row.cuadrillaId || ""),
      cuadrillaNombre: cleanValue(row.cuadrillaNombre || ""),
      ymd: cleanValue(row.ymd || ""),
      fromId: cleanValue(row.fromId || ""),
      contacto: { documento, nombres, telefono },
      normalized: {
        documento: cleanValue(pre.receptorDocumentoNorm) || normalizeDigits(documento),
        nombres: cleanValue(pre.receptorNombresNorm) || normalizeAuditName(nombres),
        telefono: cleanValue(pre.receptorTelefonoNorm) || normalizeDigits(telefono),
      },
    };
  });
}

function buildDuplicateGroups(rows: PreliqAuditRow[], kind: "documento" | "nombres" | "telefono") {
  const grouped = new Map<string, PreliqAuditRow[]>();
  for (const row of rows) {
    const key = cleanValue(row.normalized[kind]);
    if (!key) continue;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .filter(([, items]) => items.length > 1)
    .map(([normalizedValue, items]) => ({
      kind,
      normalizedValue,
      displayValue: cleanValue(items[0]?.contacto[kind]) || normalizedValue,
      count: items.length,
      cuadrillas: Array.from(new Set(items.map((item) => cleanValue(item.cuadrillaNombre || item.cuadrillaId || "SIN_CUADRILLA")))),
      pedidos: items
        .slice()
        .sort((a, b) => `${b.ymd}-${b.pedido}`.localeCompare(`${a.ymd}-${a.pedido}`))
        .map((item) => ({
          id: item.id,
          pedido: item.pedido,
          cliente: item.cliente,
          cuadrillaNombre: item.cuadrillaNombre || item.cuadrillaId || "SIN_CUADRILLA",
          ymd: item.ymd,
        })),
    }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : String(a.displayValue).localeCompare(String(b.displayValue))));
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isCoordinatorScope =
      !session.isAdmin && roles.includes("COORDINADOR") && !roles.includes("GESTOR");
    const allowed = session.isAdmin || isCoordinatorScope || session.permissions.includes("ORDENES_LIQUIDAR");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = cleanValue(searchParams.get("ymd"));
    const month = cleanValue(searchParams.get("month")) || currentLimaMonth();

    const [ordenesBase, preliquidacionesBaseBase] = await Promise.all([
      collectOrdenes({ ymd: ymd || undefined, month }),
      collectPreliquidaciones({ ymd: ymd || undefined, month }),
    ]);
    const ordenes = isCoordinatorScope
      ? ordenesBase.filter((row) => row.coordinadorId === session.uid)
      : ordenesBase;

    const ordenKeys = new Set(ordenes.map((row) => preliqOrderKey(row.pedido, row.ymd)));
    const preliquidacionesBase = isCoordinatorScope
      ? preliquidacionesBaseBase.filter((row) => ordenKeys.has(preliqOrderKey(row.pedido, row.ymd)))
      : preliquidacionesBaseBase;

    const docCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();
    const phoneCounts = new Map<string, number>();
    for (const row of preliquidacionesBase) {
      if (row.normalized.documento) docCounts.set(row.normalized.documento, (docCounts.get(row.normalized.documento) || 0) + 1);
      if (row.normalized.nombres) nameCounts.set(row.normalized.nombres, (nameCounts.get(row.normalized.nombres) || 0) + 1);
      if (row.normalized.telefono) phoneCounts.set(row.normalized.telefono, (phoneCounts.get(row.normalized.telefono) || 0) + 1);
    }

    const ordenMap = new Map(ordenes.map((row) => [preliqOrderKey(row.pedido, row.ymd), row]));

    const preliquidaciones = preliquidacionesBase
      .map((row) => {
        const orden = ordenMap.get(preliqOrderKey(row.pedido, row.ymd));
        const dupDocumento = !!row.normalized.documento && (docCounts.get(row.normalized.documento) || 0) > 1;
        const dupNombres = !!row.normalized.nombres && (nameCounts.get(row.normalized.nombres) || 0) > 1;
        const dupTelefono = !!row.normalized.telefono && (phoneCounts.get(row.normalized.telefono) || 0) > 1;
        return {
          ...row,
          coordinadorId: orden?.coordinadorId || "",
          coordinador: orden?.coordinador || "",
          duplicates: {
            documento: dupDocumento,
            nombres: dupNombres,
            telefono: dupTelefono,
            any: dupDocumento || dupNombres || dupTelefono,
          },
        };
      })
      .sort((a, b) => `${b.ymd}-${b.pedido}`.localeCompare(`${a.ymd}-${a.pedido}`));

    const preliqKeys = new Set(preliquidaciones.map((row) => preliqOrderKey(row.pedido, row.ymd)));
    const pendientesOrdenes = ordenes
      .filter((row) => !preliqKeys.has(preliqOrderKey(row.pedido, row.ymd)))
      .sort((a, b) => `${a.cuadrillaNombre}-${a.ymd}-${a.pedido}`.localeCompare(`${b.cuadrillaNombre}-${b.ymd}-${b.pedido}`));

    const pendientesByCuadrillaMap = new Map<string, { cuadrillaId: string; cuadrillaNombre: string; coordinadorId: string; coordinador: string; total: number; pedidos: Array<{ pedido: string; cliente: string; ymd: string; ordenId: string }> }>();
    for (const row of pendientesOrdenes) {
      const key = cleanValue(row.cuadrillaId || row.cuadrillaNombre);
      const current = pendientesByCuadrillaMap.get(key) || {
        cuadrillaId: row.cuadrillaId,
        cuadrillaNombre: row.cuadrillaNombre || row.cuadrillaId,
        coordinadorId: row.coordinadorId || "",
        coordinador: row.coordinador || "",
        total: 0,
        pedidos: [],
      };
      current.total += 1;
      current.pedidos.push({ pedido: row.pedido, cliente: row.cliente, ymd: row.ymd, ordenId: row.ordenId });
      pendientesByCuadrillaMap.set(key, current);
    }

    const duplicados = {
      documento: buildDuplicateGroups(preliquidacionesBase, "documento"),
      nombres: buildDuplicateGroups(preliquidacionesBase, "nombres"),
      telefono: buildDuplicateGroups(preliquidacionesBase, "telefono"),
    };

    return NextResponse.json({
      ok: true,
      scope: {
        ymd: ymd || null,
        month: ymd ? null : month,
        isCoordinatorScope,
        viewerCoordinatorUid: isCoordinatorScope ? session.uid : null,
        viewerCoordinatorNombre:
          isCoordinatorScope
            ? Array.from(
                new Set(
                  [
                    ...ordenes.map((row) => row.coordinador).filter(Boolean),
                    ...preliquidaciones.map((row) => row.coordinador || "").filter(Boolean),
                  ]
                )
              )[0] || session.uid
            : null,
      },
      summary: {
        ordenesFinalizadas: ordenes.length,
        preliquidaciones: preliquidaciones.length,
        preliquidacionesConDuplicado: preliquidaciones.filter((row) => row.duplicates.any).length,
        duplicadosDocumento: duplicados.documento.length,
        duplicadosNombres: duplicados.nombres.length,
        duplicadosTelefono: duplicados.telefono.length,
        ordenesPendientesPreliq: pendientesOrdenes.length,
        cuadrillasPendientesPreliq: pendientesByCuadrillaMap.size,
      },
      duplicados,
      pendientesByCuadrilla: Array.from(pendientesByCuadrillaMap.values()).sort((a, b) => (b.total !== a.total ? b.total - a.total : String(a.cuadrillaNombre).localeCompare(String(b.cuadrillaNombre)))),
      preliquidaciones,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
