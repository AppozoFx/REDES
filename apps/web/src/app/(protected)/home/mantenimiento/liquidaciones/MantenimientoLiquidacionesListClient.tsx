"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  ticketNumero: string;
  codigoCaja?: string;
  fechaAtencionYmd?: string;
  distrito?: string;
  cuadrillaNombre?: string;
  estado?: string;
  materialesConsumidos?: any[];
};

type CausaRaiz = {
  id: string;
  nombre: string;
};

function causaErrorMessage(code: string) {
  switch (code) {
    case "CAUSA_EN_USO":
      return "No se puede modificar ni eliminar esta causa porque ya fue usada en liquidaciones.";
    case "CAUSA_DUPLICADA":
      return "Ya existe una causa raiz con ese nombre.";
    case "NOMBRE_REQUIRED":
      return "Debes ingresar un nombre para la causa raiz.";
    case "ID_REQUIRED":
      return "No se encontro la causa raiz seleccionada.";
    default:
      return code || "Ocurrio un error al guardar la causa raiz.";
  }
}

export default function MantenimientoLiquidacionesListClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [estado, setEstado] = useState("");
  const [exporting, setExporting] = useState(false);
  const [causas, setCausas] = useState<CausaRaiz[]>([]);
  const [causasOpen, setCausasOpen] = useState(false);
  const [causaNombre, setCausaNombre] = useState("");
  const [editingCausaId, setEditingCausaId] = useState("");
  const [savingCausa, setSavingCausa] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/mantenimiento/liquidaciones/list", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        if (!cancelled) setRows(Array.isArray(body.items) ? body.items : []);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || "ERROR"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadCausas() {
    const res = await fetch("/api/mantenimiento/causas-raiz/list", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
    setCausas(Array.isArray(body.items) ? body.items : []);
  }

  useEffect(() => {
    if (!causasOpen) return;
    loadCausas().catch(() => {});
  }, [causasOpen]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (month && String(r.fechaAtencionYmd || "").slice(0, 7) !== month) return false;
      if (estado && String(r.estado || "") !== estado) return false;
      if (!needle) return true;
      const hay = `${r.ticketNumero} ${r.codigoCaja || ""} ${r.distrito || ""} ${r.cuadrillaNombre || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, month, estado]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#f3f6fb] via-white to-[#eef7f4] shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-7">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-600 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
              Mantenimiento
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Liquidaciones</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Registra tickets, controla materiales desde stock de cuadrilla y prepara la data para exportacion mensual.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCausasOpen(true);
                setCausaNombre("");
                setEditingCausaId("");
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Causas raiz
            </button>
            <Link href="/home/mantenimiento/telegram" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              Ingresos Telegram
            </Link>
            <button
              type="button"
              disabled={exporting}
              onClick={async () => {
                try {
                  setExporting(true);
                  const res = await fetch(`/api/mantenimiento/liquidaciones/export?month=${encodeURIComponent(month)}`, { cache: "no-store" });
                  if (!res.ok) throw new Error("NO_SE_PUDO_EXPORTAR");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `mantenimiento_liquidaciones_${month || "all"}.xlsx`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  setError("NO_SE_PUDO_EXPORTAR");
                } finally {
                  setExporting(false);
                }
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {exporting ? "Exportando..." : "Exportar Excel"}
            </button>
            <Link href="/home/mantenimiento/liquidaciones/new" className="rounded-xl bg-[#1f5f4a] px-4 py-2 text-sm font-medium text-white hover:bg-[#184c3a]">
              Nueva liquidacion
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bandeja operativa</h2>
          <p className="text-sm text-slate-500">Filtra por periodo, estado y ticket para trabajar sobre la base central.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Total</div>
            <div className="text-xl font-semibold">{rows.length}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Abiertas</div>
            <div className="text-xl font-semibold text-amber-800">{rows.filter((x) => x.estado === "ABIERTO").length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Liquidadas</div>
            <div className="text-xl font-semibold text-emerald-800">{rows.filter((x) => x.estado === "LIQUIDADO").length}</div>
          </div>
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ticket, caja, distrito, cuadrilla" className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">Todos los estados</option>
            <option value="ABIERTO">ABIERTO</option>
            <option value="LISTO_PARA_LIQUIDAR">LISTO_PARA_LIQUIDAR</option>
            <option value="LIQUIDADO">LIQUIDADO</option>
            <option value="CORRECCION_PENDIENTE">CORRECCION_PENDIENTE</option>
            <option value="ANULADO">ANULADO</option>
          </select>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {loading ? <div className="text-sm text-slate-500">Cargando...</div> : null}
        {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {!loading && !error ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Ticket</th>
                  <th className="p-2">Caja</th>
                  <th className="p-2">Distrito</th>
                  <th className="p-2">Cuadrilla</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Materiales</th>
                  <th className="p-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.fechaAtencionYmd || "-"}</td>
                    <td className="p-2 font-medium">{r.ticketNumero || r.id}</td>
                    <td className="p-2">{r.codigoCaja || "-"}</td>
                    <td className="p-2">{r.distrito || "-"}</td>
                    <td className="p-2">{r.cuadrillaNombre || "-"}</td>
                    <td className="p-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          r.estado === "LIQUIDADO"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.estado === "ABIERTO"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {r.estado || "-"}
                      </span>
                    </td>
                    <td className="p-2">{Array.isArray(r.materialesConsumidos) ? r.materialesConsumidos.length : 0}</td>
                    <td className="p-2">
                      <Link href={`/home/mantenimiento/liquidaciones/${r.id}`} className="text-blue-700 hover:underline">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">Sin registros para mostrar.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {causasOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setCausasOpen(false)}>
          <div className="w-full max-w-3xl rounded-[24px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold">Causas raiz de mantenimiento</h3>
                <p className="text-sm text-slate-500">Administra opciones uniformes para formularios y dashboards.</p>
              </div>
              <button type="button" onClick={() => setCausasOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                Cerrar
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-80 flex-1">
                  <label className="mb-1 block text-xs text-slate-500">{editingCausaId ? "Editar causa" : "Nueva causa"}</label>
                  <input
                    value={causaNombre}
                    onChange={(e) => setCausaNombre(e.target.value)}
                    placeholder="Ej. CTO SIN POTENCIA"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingCausa || !causaNombre.trim()}
                  onClick={async () => {
                    try {
                      setSavingCausa(true);
                      const endpoint = editingCausaId ? "/api/mantenimiento/causas-raiz/update" : "/api/mantenimiento/causas-raiz/create";
                      const res = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(editingCausaId ? { id: editingCausaId, nombre: causaNombre } : { nombre: causaNombre }),
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
                      setCausaNombre("");
                      setEditingCausaId("");
                      await loadCausas();
                    } catch (e: any) {
                      setError(causaErrorMessage(String(e?.message || "ERROR")));
                    } finally {
                      setSavingCausa(false);
                    }
                  }}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingCausa ? "Guardando..." : editingCausaId ? "Actualizar" : "Crear"}
                </button>
                {editingCausaId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCausaId("");
                      setCausaNombre("");
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>

              <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr className="text-left">
                      <th className="p-2">Nombre</th>
                      <th className="p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {causas.map((causa) => (
                      <tr key={causa.id} className="border-t">
                        <td className="p-2">{causa.nombre}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCausaId(causa.id);
                                setCausaNombre(causa.nombre);
                              }}
                              className="text-blue-700 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(`Eliminar causa raiz "${causa.nombre}"?`)) return;
                                try {
                                  const res = await fetch("/api/mantenimiento/causas-raiz/delete", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: causa.id }),
                                  });
                                  const body = await res.json().catch(() => ({}));
                                  if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
                                  if (editingCausaId === causa.id) {
                                    setEditingCausaId("");
                                    setCausaNombre("");
                                  }
                                  await loadCausas();
                                } catch (e: any) {
                                  setError(causaErrorMessage(String(e?.message || "ERROR")));
                                }
                              }}
                              className="text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!causas.length ? (
                      <tr>
                        <td colSpan={2} className="p-4 text-center text-slate-500">No hay causas registradas.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
