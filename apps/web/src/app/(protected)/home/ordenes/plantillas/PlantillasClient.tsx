"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";

type DuplicateGroup = {
  kind: "documento" | "nombres" | "telefono";
  normalizedValue: string;
  displayValue: string;
  count: number;
  cuadrillas: string[];
  pedidos: Array<{
    id: string;
    pedido: string;
    cliente: string;
    cuadrillaNombre: string;
    ymd: string;
  }>;
};

type PreliqRow = {
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
  duplicates: {
    documento: boolean;
    nombres: boolean;
    telefono: boolean;
    any: boolean;
  };
};

type PendingCuadrilla = {
  cuadrillaId: string;
  cuadrillaNombre: string;
  coordinadorId: string;
  coordinador: string;
  total: number;
  pedidos: Array<{
    pedido: string;
    cliente: string;
    ymd: string;
    ordenId: string;
  }>;
};

type Payload = {
  scope: {
    ymd: string | null;
    month: string | null;
    isCoordinatorScope?: boolean;
    viewerCoordinatorUid?: string | null;
    viewerCoordinatorNombre?: string | null;
  };
  summary: {
    ordenesFinalizadas: number;
    preliquidaciones: number;
    preliquidacionesConDuplicado: number;
    duplicadosDocumento: number;
    duplicadosNombres: number;
    duplicadosTelefono: number;
    ordenesPendientesPreliq: number;
    cuadrillasPendientesPreliq: number;
  };
  duplicados: {
    documento: DuplicateGroup[];
    nombres: DuplicateGroup[];
    telefono: DuplicateGroup[];
  };
  pendientesByCuadrilla: PendingCuadrilla[];
  preliquidaciones: PreliqRow[];
};

function kindLabel(kind: DuplicateGroup["kind"]) {
  if (kind === "documento") return "Documento";
  if (kind === "nombres") return "Nombres";
  return "Telefono";
}

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function PlantillasClient({ initialYmd, initialMonth }: { initialYmd: string; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [ymd, setYmd] = useState("");
  const [search, setSearch] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [dupFilter, setDupFilter] = useState("todas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function run() {
      setLoading(true);
      setError("");
      try {
        const query = ymd ? `ymd=${encodeURIComponent(ymd)}` : `month=${encodeURIComponent(month)}`;
        const res = await fetch(`/api/ordenes/plantillas?${query}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const body = await res.json();
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        if (!cancelled) setData(body as Payload);
      } catch (e: any) {
        if (!cancelled) {
          setData(null);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [month, ymd]);

  useEffect(() => {
    if (!data?.scope?.isCoordinatorScope) return;
    const ownName = String(data.scope.viewerCoordinatorNombre || "").trim();
    if (ownName && coordinador !== ownName) {
      setCoordinador(ownName);
    }
  }, [data?.scope?.isCoordinatorScope, data?.scope?.viewerCoordinatorNombre, coordinador]);

  const searchNorm = useMemo(() => normalizeSearch(search), [search]);

  const preliquidaciones = useMemo(() => {
    const rows = data?.preliquidaciones || [];
    return rows.filter((row) => {
      if (dupFilter === "duplicadas" && !row.duplicates.any) return false;
      if (dupFilter === "limpias" && row.duplicates.any) return false;
      if (coordinador && (row.coordinador || "") !== coordinador) return false;
      if (!searchNorm) return true;
      const hay = normalizeSearch(
        [
          row.pedido,
          row.cliente,
          row.coordinador || "",
          row.cuadrillaNombre,
          row.cuadrillaId,
          row.contacto.documento,
          row.contacto.nombres,
          row.contacto.telefono,
          row.ymd,
        ].join(" ")
      );
      return hay.includes(searchNorm);
    });
  }, [data?.preliquidaciones, dupFilter, searchNorm, coordinador]);

  const pendientesByCuadrilla = useMemo(() => {
    const rows = data?.pendientesByCuadrilla || [];
    const filteredByCoordinator = coordinador
      ? rows.filter((row) => (row.coordinador || "") === coordinador)
      : rows;
    if (!searchNorm) return filteredByCoordinator;
    return filteredByCoordinator.filter((row) => {
      const hay = normalizeSearch(
        [
          row.cuadrillaNombre,
          row.cuadrillaId,
          row.coordinador || "",
          ...row.pedidos.flatMap((pedido) => [pedido.pedido, pedido.cliente, pedido.ymd]),
        ].join(" ")
      );
      return hay.includes(searchNorm);
    });
  }, [data?.pendientesByCuadrilla, searchNorm, coordinador]);

  const duplicateGroups = useMemo(() => {
    const groups = [
      ...(data?.duplicados.documento || []),
      ...(data?.duplicados.nombres || []),
      ...(data?.duplicados.telefono || []),
    ];
    return groups.filter((group) => {
      if (!searchNorm) return true;
      const hay = normalizeSearch(
        [
          group.displayValue,
          ...group.cuadrillas,
          ...group.pedidos.flatMap((pedido) => [pedido.pedido, pedido.cliente, pedido.cuadrillaNombre, pedido.ymd]),
        ].join(" ")
      );
      return hay.includes(searchNorm);
    });
  }, [data?.duplicados, searchNorm]);

  const activeScope = ymd || month || initialYmd;
  const isCoordinatorScope = !!data?.scope?.isCoordinatorScope;
  const coordinadores = useMemo(
    () =>
      Array.from(
        new Set([
          ...(data?.pendientesByCuadrilla || []).map((row) => row.coordinador || "").filter(Boolean),
          ...(data?.preliquidaciones || []).map((row) => row.coordinador || "").filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b)),
    [data?.pendientesByCuadrilla, data?.preliquidaciones]
  );
  const totalPendientesPedidos = useMemo(
    () => pendientesByCuadrilla.reduce((acc, row) => acc + row.total, 0),
    [pendientesByCuadrilla]
  );

  function downloadPendientesExcel() {
    if (!pendientesByCuadrilla.length) return;
    const rows = pendientesByCuadrilla.flatMap((row) =>
      row.pedidos.map((pedido) => ({
        Cuadrilla: row.cuadrillaNombre || row.cuadrillaId || "SIN_CUADRILLA",
        Coordinador: row.coordinador || "",
        Pedido: pedido.pedido,
        Cliente: pedido.cliente || "",
        Fecha: pedido.ymd,
        Estado: "FALTA_ENVIAR_PLANTILLA",
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendientes");
    const suffix = (ymd || month || initialYmd).replace(/[^0-9-]/g, "_");
    XLSX.writeFile(wb, `ordenes_plantillas_pendientes_${suffix}.xlsx`);
  }

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Ordenes - Plantillas</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Primero revisa que cuadrillas no enviaron plantilla. Despues audita si los datos del receptor se estan repitiendo.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-sm">Mes</label>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                if (ymd) setYmd("");
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm">Fecha exacta</label>
            <input
              type="date"
              value={ymd}
              max={initialYmd}
              onChange={(e) => setYmd(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <div className="min-w-72 flex-1">
            <label className="mb-1 block text-sm">Buscar</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pedido, cliente, cuadrilla, documento, nombres, telefono"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <div className="min-w-60">
            <label className="mb-1 block text-sm">Coordinador</label>
            <select
              value={coordinador}
              onChange={(e) => setCoordinador(e.target.value)}
              disabled={isCoordinatorScope}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            >
              {!isCoordinatorScope ? <option value="">Todos</option> : null}
              {coordinadores.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Preliquidaciones</label>
            <select
              value={dupFilter}
              onChange={(e) => setDupFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            >
              <option value="todas">Todas</option>
              <option value="duplicadas">Solo duplicadas</option>
              <option value="limpias">Solo limpias</option>
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          Alcance activo: {activeScope}
          {isCoordinatorScope ? ` | Coordinador: ${data?.scope?.viewerCoordinatorNombre || "-"}` : ""}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric title="Cuadrillas sin plantilla" value={data?.summary.cuadrillasPendientesPreliq || 0} tone="rose" />
        <Metric title="Pedidos sin plantilla" value={data?.summary.ordenesPendientesPreliq || 0} tone="rose" />
        <Metric title="Preliquidaciones" value={data?.summary.preliquidaciones || 0} tone="emerald" />
        <Metric title="Con duplicados" value={data?.summary.preliquidacionesConDuplicado || 0} tone="amber" />
      </section>

      <section className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm dark:border-rose-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">1. Cuadrillas que faltan enviar plantilla</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Esta es la tarea principal. Se muestran las ordenes finalizadas que no tienen registro en `telegram_preliquidaciones`.
            </div>
          </div>
          <button
            type="button"
            onClick={downloadPendientesExcel}
            disabled={!pendientesByCuadrilla.length}
            className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/20 dark:text-rose-300"
          >
            Descargar Excel de faltantes
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Metric title="Cuadrillas pendientes" value={data?.summary.cuadrillasPendientesPreliq || 0} tone="rose" />
          <Metric title="Pedidos pendientes" value={totalPendientesPedidos} tone="rose" />
          <Metric title="Ordenes finalizadas" value={data?.summary.ordenesFinalizadas || 0} tone="slate" />
        </div>

        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-200">
          Usa el Excel para enviar el listado a regularizacion.
        </div>

        {loading ? <EmptyState text="Cargando pendientes..." /> : null}
        {!loading && pendientesByCuadrilla.length === 0 ? <EmptyState text="No hay cuadrillas pendientes en el alcance actual." /> : null}
        {!loading ? (
          <div className="space-y-3">
            {pendientesByCuadrilla.map((row) => (
              <div key={`${row.cuadrillaId}-${row.cuadrillaNombre}`} className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-800 dark:bg-rose-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{row.cuadrillaNombre || row.cuadrillaId}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Coordinador: {row.coordinador || "-"}</div>
                  </div>
                  <div className="rounded-full border border-rose-300 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-700 dark:text-rose-300">
                    {row.total} pendientes
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {row.pedidos.map((pedido) => (
                    <div key={`${row.cuadrillaId}-${pedido.ordenId}`} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                      <span className="font-semibold">{pedido.pedido}</span> | {pedido.cliente || "-"} | {pedido.ymd}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[.95fr_1.05fr]">
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-800 dark:bg-slate-900">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">2. Receptores repetidos</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Auditoria secundaria para detectar si se repiten documento, nombres o telefono del contacto receptor.
            </div>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <Metric title="Docs repetidos" value={data?.summary.duplicadosDocumento || 0} tone="amber" />
            <Metric title="Nombres repetidos" value={data?.summary.duplicadosNombres || 0} tone="amber" />
            <Metric title="Telefonos repetidos" value={data?.summary.duplicadosTelefono || 0} tone="amber" />
          </div>
          {loading ? <EmptyState text="Cargando auditoria..." /> : null}
          {!loading && duplicateGroups.length === 0 ? <EmptyState text="No se encontraron duplicados en el alcance actual." /> : null}
          {!loading ? (
            <div className="space-y-3">
              {duplicateGroups.map((group) => (
                <div key={`${group.kind}-${group.normalizedValue}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:text-amber-300">
                      {kindLabel(group.kind)}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{group.displayValue}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{group.count} coincidencias</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Cuadrillas: {group.cuadrillas.join(", ")}
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {group.pedidos.map((item) => (
                      <div key={`${group.kind}-${item.id}`} className="rounded-lg border border-white/70 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60">
                        <span className="font-semibold">{item.pedido}</span> | {item.cliente || "-"} | {item.cuadrillaNombre} | {item.ymd}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Detalle de preliquidaciones</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Puedes filtrar por documento, nombres, telefono, cliente o cuadrilla.
            </div>
          </div>
          {loading ? <EmptyState text="Cargando pendientes..." /> : null}
          {!loading && preliquidaciones.length === 0 ? <EmptyState text="No hay preliquidaciones para mostrar con los filtros actuales." /> : null}
          {!loading ? (
            <div className="space-y-3">
              {preliquidaciones.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{row.pedido}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{row.cliente || "-"}</span>
                    <span className="rounded-full border border-sky-300 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-700 dark:text-sky-300">
                      Coord. {row.coordinador || "-"}
                    </span>
                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                      {row.cuadrillaNombre || row.cuadrillaId || "SIN_CUADRILLA"}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{row.ymd}</span>
                    {row.duplicates.documento ? <Badge tone="amber" label="Doc duplicado" /> : null}
                    {row.duplicates.nombres ? <Badge tone="amber" label="Nombre duplicado" /> : null}
                    {row.duplicates.telefono ? <Badge tone="amber" label="Telefono duplicado" /> : null}
                  </div>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <Field label="Documento" value={row.contacto.documento} />
                    <Field label="Nombres" value={row.contacto.nombres} />
                    <Field label="Telefono" value={row.contacto.telefono} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: number; tone: "slate" | "emerald" | "amber" | "rose" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
      : tone === "rose"
      ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700"
      : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-xs">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">{text}</div>;
}

function Badge({ label, tone }: { label: string; tone: "amber" }) {
  const cls = tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300" : "";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="font-medium text-slate-900 dark:text-slate-100">{value || "-"}</div>
    </div>
  );
}
