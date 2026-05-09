import { adminDb } from "@/lib/firebase/admin";

export const OC_ITEM_CODES = {
  RESIDENCIAL: "001",
  CONDOMINIO: "002",
  CAT5E: "003",
  CAT6: "004",
} as const;

export type OcConceptTotals = {
  residencial: number;
  condominio: number;
  cat5e: number;
  cat6: number;
};

export type PendingInstallation = {
  instalacionId: string;
  ordenId: string;
  cliente: string;
  cuadrilla: string;
  coordinadorUid: string;
  fechaInstalacion: string;
  available: OcConceptTotals;
};

export type OcPendingSummary = {
  totalInstalaciones: number;
  residencial: number;
  condominio: number;
  cat5e: number;
  cat6: number;
  totalEnRango: number;
  yaConsideradas: number;
  totalPendientes: number;
};

type RawInstallation = Record<string, unknown>;

type ConsumptionRow = {
  consumos?: Partial<OcConceptTotals>;
};

function toStr(v: unknown) {
  return String(v || "").trim();
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDateYmd(value: string) {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function tipoOrdenOf(doc: any) {
  return toStr(doc?.orden?.tipoOrden).toUpperCase();
}

function isResidencial(doc: any) {
  return tipoOrdenOf(doc) === "RESIDENCIAL";
}

function isCondominio(doc: any) {
  return tipoOrdenOf(doc) === "CONDOMINIO";
}

function qtyCat5e(doc: any) {
  const servicios = (doc?.servicios || doc?.liquidacion?.servicios || {}) as any;
  const explicit = toNum(servicios?.cat5e ?? doc?.cat5e);
  if (explicit > 0) return explicit;
  const txt = `${toStr(servicios?.servicioCableadoMesh)} ${toStr(doc?.utp_cat)} ${toStr(doc?.material)}`.toLowerCase();
  return txt.includes("5e") || /cat ?5e/.test(txt) ? 1 : 0;
}

function qtyCat6(doc: any) {
  const servicios = (doc?.servicios || doc?.liquidacion?.servicios || {}) as any;
  const explicit = toNum(servicios?.cat6 ?? doc?.cat6);
  if (explicit > 0) return explicit;
  const txt = `${toStr(servicios?.servicioCableadoMesh)} ${toStr(doc?.utp_cat)} ${toStr(doc?.material)}`.toLowerCase();
  return /\b6\b/.test(txt) || /cat ?6/.test(txt) ? 1 : 0;
}

function coordUidOf(doc: any) {
  return toStr(doc?.orden?.coordinadorCuadrilla);
}

function cuadrillaOf(doc: any) {
  return toStr(doc?.cuadrillaNombre || doc?.cuadrilla || doc?.orden?.cuadrillaNombre || "-") || "-";
}

function fechaYmdOf(doc: any) {
  return normalizeDateYmd(
    String(
      doc?.fechaOrdenYmd ||
        doc?.fechaInstalacionYmd ||
        doc?.orden?.fechaFinVisiYmd ||
        doc?.orden?.fSoliYmd ||
        ""
    )
  );
}

function clienteOf(doc: any) {
  return toStr(doc?.cliente || doc?.orden?.nombreCliente || doc?.orden?.cliente || doc?.codiSeguiClien || doc?.orden?.codiSeguiClien);
}

function ordenIdOf(doc: any) {
  return toStr(doc?.ordenId || doc?.orden?.ordenId || doc?.codiSeguiClien || doc?.orden?.codiSeguiClien);
}

function zeroTotals(): OcConceptTotals {
  return { residencial: 0, condominio: 0, cat5e: 0, cat6: 0 };
}

export function buildInstallationConceptTotals(doc: any): OcConceptTotals {
  return {
    residencial: isResidencial(doc) ? 1 : 0,
    condominio: isCondominio(doc) ? 1 : 0,
    cat5e: qtyCat5e(doc),
    cat6: qtyCat6(doc),
  };
}

export function buildInstallationSnapshot(doc: any, coordinadorUid?: string) {
  return {
    ordenId: ordenIdOf(doc),
    cliente: clienteOf(doc),
    cuadrilla: cuadrillaOf(doc),
    coordinadorUid: coordinadorUid || coordUidOf(doc),
    fechaInstalacion: fechaYmdOf(doc),
  };
}

function sumTotals(target: OcConceptTotals, patch: Partial<OcConceptTotals>) {
  target.residencial += toNum(patch.residencial);
  target.condominio += toNum(patch.condominio);
  target.cat5e += toNum(patch.cat5e);
  target.cat6 += toNum(patch.cat6);
}

function maxZero(n: number) {
  return n > 0 ? n : 0;
}

export async function loadPendingInstallations(args: {
  coordinadorUid: string;
  desde: string;
  hasta: string;
}) {
  const { coordinadorUid, desde, hasta } = args;
  const db = adminDb();

  const [instSnap] = await Promise.all([
    db
      .collection("instalaciones")
      .where("fechaOrdenYmd", ">=", desde)
      .where("fechaOrdenYmd", "<=", hasta)
      .limit(10000)
      .get(),
  ]);

  const installations = instSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as RawInstallation) }))
    .filter((row) => coordUidOf(row) === coordinadorUid)
    .filter((row) => {
      const f = fechaYmdOf(row);
      return !!f && f >= desde && f <= hasta;
    });

  const consumptionRefs = installations.map((row) => db.collection("ordenes_compra_consumo").doc(row.id));
  const consumptionSnaps = consumptionRefs.length ? await db.getAll(...consumptionRefs) : [];
  const consumedByInstallation = new Map<string, OcConceptTotals>();
  consumptionSnaps.forEach((snap) => {
    if (!snap.exists) return;
    const data = snap.data() as ConsumptionRow;
    consumedByInstallation.set(snap.id, {
      residencial: toNum(data?.consumos?.residencial),
      condominio: toNum(data?.consumos?.condominio),
      cat5e: toNum(data?.consumos?.cat5e),
      cat6: toNum(data?.consumos?.cat6),
    });
  });

  const pending: PendingInstallation[] = [];
  const summary: OcPendingSummary = {
    totalInstalaciones: 0,
    residencial: 0,
    condominio: 0,
    cat5e: 0,
    cat6: 0,
    totalEnRango: installations.length,
    yaConsideradas: 0,
    totalPendientes: 0,
  };

  const group = new Map<string, { cuadrilla: string; residencial: number; condominio: number; cat5e: number; cat6: number }>();

  for (const row of installations) {
    const raw = buildInstallationConceptTotals(row);
    const consumed = consumedByInstallation.get(row.id) || zeroTotals();
    const available = {
      residencial: maxZero(raw.residencial - consumed.residencial),
      condominio: maxZero(raw.condominio - consumed.condominio),
      cat5e: maxZero(raw.cat5e - consumed.cat5e),
      cat6: maxZero(raw.cat6 - consumed.cat6),
    };
    const hasPending = available.residencial || available.condominio || available.cat5e || available.cat6;
    if (!hasPending) {
      summary.yaConsideradas += 1;
      continue;
    }

    summary.totalInstalaciones += 1;
    summary.totalPendientes += 1;
    summary.residencial += available.residencial;
    summary.condominio += available.condominio;
    summary.cat5e += available.cat5e;
    summary.cat6 += available.cat6;

    const cuadrilla = cuadrillaOf(row);
    const groupRow = group.get(cuadrilla) || { cuadrilla, residencial: 0, condominio: 0, cat5e: 0, cat6: 0 };
    groupRow.residencial += available.residencial;
    groupRow.condominio += available.condominio;
    groupRow.cat5e += available.cat5e;
    groupRow.cat6 += available.cat6;
    group.set(cuadrilla, groupRow);

    pending.push({
      instalacionId: row.id,
      ordenId: ordenIdOf(row),
      cliente: clienteOf(row),
      cuadrilla,
      coordinadorUid,
      fechaInstalacion: fechaYmdOf(row),
      available,
    });
  }

  const porCuadrilla = Array.from(group.values()).sort((a, b) =>
    a.cuadrilla.localeCompare(b.cuadrilla, "es", { sensitivity: "base" })
  );

  summary.totalInstalaciones = summary.totalPendientes;

  return { pending, summary, porCuadrilla };
}

export function requestedConceptTotalsFromItems(items: Array<{ codigo: string; cantidad: number }>) {
  const totals = zeroTotals();
  for (const item of items) {
    const code = toStr(item.codigo);
    const qty = Math.max(0, toNum(item.cantidad));
    if (code === OC_ITEM_CODES.RESIDENCIAL) totals.residencial += qty;
    if (code === OC_ITEM_CODES.CONDOMINIO) totals.condominio += qty;
    if (code === OC_ITEM_CODES.CAT5E) totals.cat5e += qty;
    if (code === OC_ITEM_CODES.CAT6) totals.cat6 += qty;
  }
  return totals;
}

export function allocateOrderConsumption(
  pending: PendingInstallation[],
  requested: OcConceptTotals
) {
  const remaining = { ...requested };
  const allocations = pending.map((row) => ({
    ...row,
    consumos: zeroTotals(),
  }));

  const allocateUnit = (concept: keyof OcConceptTotals) => {
    for (const row of allocations) {
      if (remaining[concept] <= 0) break;
      if (row.available[concept] <= row.consumos[concept]) continue;
      row.consumos[concept] += 1;
      remaining[concept] -= 1;
    }
  };

  const allocateMany = (concept: keyof OcConceptTotals) => {
    for (const row of allocations) {
      if (remaining[concept] <= 0) break;
      const free = row.available[concept] - row.consumos[concept];
      if (free <= 0) continue;
      const take = Math.min(free, remaining[concept]);
      row.consumos[concept] += take;
      remaining[concept] -= take;
    }
  };

  allocateUnit("residencial");
  allocateUnit("condominio");
  allocateMany("cat5e");
  allocateMany("cat6");

  return {
    allocations: allocations.filter(
      (row) => row.consumos.residencial || row.consumos.condominio || row.consumos.cat5e || row.consumos.cat6
    ),
    remaining,
  };
}
