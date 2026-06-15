"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type OrdenRow = {
  id: string;
  codigo: string;
  tipoOc?: string;
  estado: string;
  coordinadorNombre: string;
  proveedor: { razonSocial: string; ruc: string };
  periodo: { desde: string; hasta: string };
  totales: { subtotal: number; igv: number; total: number };
  pdfUrl: string;
  createdAt: string;
};

type Summary = {
  totalOrdenes: number;
  totalOrdenesActivas: number;
  totalMonto: number;
};

function defaultYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function money(v: number) {
  return `S/ ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(v: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-PE");
}

function formatPeriodo(desde: string, hasta: string) {
  const fmt = (s: string) => {
    if (!s) return "-";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${fmt(desde)} al ${fmt(hasta)}`;
}

function EstadoBadge({ estado }: { estado: string }) {
  const upper = String(estado || "").toUpperCase();
  if (upper === "GENERADA") {
    return (
      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        Generada
      </span>
    );
  }
  if (upper === "BORRADOR") {
    return (
      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Borrador
      </span>
    );
  }
  if (upper === "ANULADA") {
    return (
      <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        Anulada
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {estado || "-"}
    </span>
  );
}

export default function OrdenesCompraMesClient() {
  const [ym, setYm] = useState(defaultYm());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrdenRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalOrdenes: 0, totalOrdenesActivas: 0, totalMonto: 0 });
  const [cancellingId, setCancellingId] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"TODOS" | "INSTALACIONES" | "MANTENIMIENTO">("TODOS");

  const load = useCallback(async (targetYm: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gerencia/orden-compra/list?ym=${encodeURIComponent(targetYm)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows(Array.isArray(body.items) ? body.items : []);
      setSummary({
        totalOrdenes: Number(body?.summary?.totalOrdenes || 0),
        totalOrdenesActivas: Number(body?.summary?.totalOrdenesActivas || 0),
        totalMonto: Number(body?.summary?.totalMonto || 0),
      });
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron cargar las órdenes del mes");
      setRows([]);
      setSummary({ totalOrdenes: 0, totalOrdenesActivas: 0, totalMonto: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(ym);
  }, [ym, load]);

  const anularOrden = async (row: OrdenRow) => {
    if (row.estado === "ANULADA" || cancellingId) return;
    setCancellingId(row.codigo);
    setConfirmingId("");
    try {
      const res = await fetch("/api/gerencia/orden-compra/anular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ordenId: row.codigo }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      toast.success(`Orden ${row.codigo} anulada correctamente`);
      await load(ym);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo anular la orden");
    } finally {
      setCancellingId("");
    }
  };

  const filteredRows =
    tipoFilter === "TODOS"
      ? rows
      : rows.filter((r) => (r.tipoOc || "INSTALACIONES").toUpperCase() === tipoFilter);

  // Métricas financieras derivadas de las filas filtradas (excluye ANULADAS)
  const activeFiltered = filteredRows.filter(
    (r) => String(r.estado || "").toUpperCase() !== "ANULADA"
  );
  const totalSubtotal = Number(
    activeFiltered.reduce((acc, r) => acc + Number(r.totales?.subtotal || 0), 0).toFixed(2)
  );
  const totalIgv = Number(
    activeFiltered.reduce((acc, r) => acc + Number(r.totales?.igv || 0), 0).toFixed(2)
  );
  const totalMonto = Number(
    activeFiltered.reduce((acc, r) => acc + Number(r.totales?.total || 0), 0).toFixed(2)
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Órdenes de Compra por Mes</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Visualiza las órdenes generadas y abre su PDF.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Mes
            </label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Tipo
            </label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              {(["TODOS", "INSTALACIONES", "MANTENIMIENTO"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoFilter(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    tipoFilter === t
                      ? "bg-[#30518c] text-white"
                      : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {t === "TODOS" ? "Todas" : t === "INSTALACIONES" ? "Instalaciones" : "Mantenimiento"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-5">
          <Metric title="Total órdenes" value={String(filteredRows.length)} />
          <Metric title="Órdenes activas" value={String(activeFiltered.length)} />
          <Metric title="Subtotal (sin IGV)" value={money(totalSubtotal)} variant="blue" />
          <Metric title="IGV (18%)" value={money(totalIgv)} variant="amber" />
          <Metric title="Total activo" value={money(totalMonto)} variant="emerald" />
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Código</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Tipo</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Generada</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Coordinador</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Proveedor</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Período</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Estado</th>
              <th className="border border-slate-200 p-2 text-right dark:border-slate-700">Subtotal</th>
              <th className="border border-slate-200 p-2 text-right dark:border-slate-700">IGV</th>
              <th className="border border-slate-200 p-2 text-right dark:border-slate-700">Total</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">PDF</th>
              <th className="border border-slate-200 p-2 text-left dark:border-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  className="border border-slate-200 p-6 text-center text-slate-500 dark:border-slate-700 dark:text-slate-300"
                  colSpan={12}
                >
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && !filteredRows.length && (
              <tr>
                <td
                  className="border border-slate-200 p-6 text-center text-slate-500 dark:border-slate-700 dark:text-slate-300"
                  colSpan={12}
                >
                  {rows.length > 0
                    ? `Sin órdenes de tipo "${tipoFilter === "INSTALACIONES" ? "Instalaciones" : "Mantenimiento"}" para el mes seleccionado`
                    : "Sin órdenes para el mes seleccionado"}
                </td>
              </tr>
            )}
            {!loading &&
              filteredRows.map((r) => (
                <tr
                  key={r.id}
                  className="odd:bg-white even:bg-slate-50/60 hover:bg-slate-100/80 dark:odd:bg-slate-900 dark:even:bg-slate-800/60 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="border border-slate-200 p-2 font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
                    {r.codigo}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        r.tipoOc === "MANTENIMIENTO"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      }`}
                    >
                      {r.tipoOc === "MANTENIMIENTO" ? "Mantenimiento" : "Instalaciones"}
                    </span>
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700 dark:text-slate-200">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700 dark:text-slate-200">
                    {r.coordinadorNombre || "-"}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700">
                    <div className="font-medium dark:text-slate-200">{r.proveedor?.razonSocial || "-"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.proveedor?.ruc || ""}</div>
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700 dark:text-slate-200">
                    {formatPeriodo(r.periodo?.desde, r.periodo?.hasta)}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700">
                    <EstadoBadge estado={r.estado} />
                  </td>
                  <td className="border border-slate-200 p-2 text-right dark:border-slate-700 dark:text-slate-200">
                    {money(r.totales?.subtotal || 0)}
                  </td>
                  <td className="border border-slate-200 p-2 text-right dark:border-slate-700 dark:text-slate-200">
                    {money(r.totales?.igv || 0)}
                  </td>
                  <td className="border border-slate-200 p-2 text-right font-semibold dark:border-slate-700 dark:text-slate-200">
                    {money(r.totales?.total || 0)}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700">
                    {r.pdfUrl ? (
                      <a
                        href={r.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Ver PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Sin PDF</span>
                    )}
                  </td>
                  <td className="border border-slate-200 p-2 dark:border-slate-700">
                    {r.estado === "ANULADA" ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                    ) : confirmingId === r.codigo ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!!cancellingId}
                          onClick={() => anularOrden(r)}
                          className="rounded-lg border border-rose-400 bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {cancellingId === r.codigo ? "Anulando..." : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          disabled={!!cancellingId}
                          onClick={() => setConfirmingId("")}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!!cancellingId}
                        onClick={() => setConfirmingId(r.codigo)}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const METRIC_STYLES = {
  default: {
    wrap: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
    label: "text-slate-500 dark:text-slate-400",
    value: "text-slate-800 dark:text-slate-100",
  },
  blue: {
    wrap: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
    label: "text-blue-600 dark:text-blue-400",
    value: "text-blue-900 dark:text-blue-100",
  },
  amber: {
    wrap: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
    label: "text-amber-600 dark:text-amber-400",
    value: "text-amber-900 dark:text-amber-100",
  },
  emerald: {
    wrap: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20",
    label: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-900 dark:text-emerald-100",
  },
} as const;

function Metric({ title, value, variant = "default" }: { title: string; value: string; variant?: keyof typeof METRIC_STYLES }) {
  const s = METRIC_STYLES[variant];
  return (
    <div className={`rounded-xl border p-3 ${s.wrap}`}>
      <div className={`text-xs uppercase tracking-wide ${s.label}`}>{title}</div>
      <div className={`mt-1 text-xl font-semibold ${s.value}`}>{value}</div>
    </div>
  );
}
