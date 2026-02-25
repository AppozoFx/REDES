"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type OrdenRow = {
  id: string;
  codigo: string;
  estado: string;
  coordinadorNombre: string;
  proveedor: { razonSocial: string; ruc: string };
  periodo: { desde: string; hasta: string };
  totales: { subtotal: number; igv: number; total: number };
  pdfUrl: string;
  createdAt: string;
};

function defaultYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function money(v: number) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}

function formatDate(v: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("es-PE");
}

export default function OrdenesCompraMesClient() {
  const [ym, setYm] = useState(defaultYm());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OrdenRow[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);

  const load = async (targetYm = ym) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gerencia/orden-compra/list?ym=${encodeURIComponent(targetYm)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows(Array.isArray(body.items) ? body.items : []);
      setTotalMonto(Number(body?.summary?.totalMonto || 0));
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar órdenes del mes");
      setRows([]);
      setTotalMonto(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(ym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalOrdenes = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Ordenes de Compra por Mes</h2>
            <p className="text-sm text-slate-500">
              Visualiza las ordenes generadas y abre su PDF.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Mes</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => load(ym)}
            disabled={loading}
            className="h-10 rounded-xl bg-[#30518c] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Metric title="Total ordenes" value={String(totalOrdenes)} />
          <Metric title="Monto total" value={money(totalMonto)} />
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="border border-slate-200 p-2 text-left">Codigo</th>
              <th className="border border-slate-200 p-2 text-left">Generada</th>
              <th className="border border-slate-200 p-2 text-left">Coordinador</th>
              <th className="border border-slate-200 p-2 text-left">Proveedor</th>
              <th className="border border-slate-200 p-2 text-left">Periodo</th>
              <th className="border border-slate-200 p-2 text-left">Estado</th>
              <th className="border border-slate-200 p-2 text-right">Total</th>
              <th className="border border-slate-200 p-2 text-left">PDF</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="border border-slate-200 p-4 text-center text-slate-500" colSpan={8}>
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && !rows.length && (
              <tr>
                <td className="border border-slate-200 p-4 text-center text-slate-500" colSpan={8}>
                  Sin ordenes para el mes seleccionado
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="odd:bg-white even:bg-slate-50/60">
                  <td className="border border-slate-200 p-2 font-semibold text-slate-800">{r.codigo}</td>
                  <td className="border border-slate-200 p-2">{formatDate(r.createdAt)}</td>
                  <td className="border border-slate-200 p-2">{r.coordinadorNombre || "-"}</td>
                  <td className="border border-slate-200 p-2">
                    <div className="font-medium">{r.proveedor?.razonSocial || "-"}</div>
                    <div className="text-xs text-slate-500">{r.proveedor?.ruc || ""}</div>
                  </td>
                  <td className="border border-slate-200 p-2">
                    {r.periodo?.desde || "-"} al {r.periodo?.hasta || "-"}
                  </td>
                  <td className="border border-slate-200 p-2">{r.estado || "-"}</td>
                  <td className="border border-slate-200 p-2 text-right">{money(r.totales?.total || 0)}</td>
                  <td className="border border-slate-200 p-2">
                    {r.pdfUrl ? (
                      <a
                        href={r.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        Ver PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Sin PDF</span>
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

