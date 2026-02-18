"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Row = {
  id: string;
  ordenId: string;
  fechaGarantiaYmd: string;
  cliente: string;
  codigoCliente: string;
  plan: string;
  direccion: string;
  cuadrilla: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaInicio: string;
  horaFin: string;
  motivoCancelacion: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  motivoGarantia: string;
  diagnosticoGarantia: string;
  solucionGarantia: string;
  responsableGarantia: string;
  casoGarantia: string;
  imputadoGarantia: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
};

type Sort = { field: keyof Row | null; dir: "asc" | "desc" };

const OPC_RESPONSABLE = ["Cuadrilla", "Cliente", "Externo"];
const OPC_CASO = [
  "Cambio de ONT",
  "Cambio de MESH",
  "Cambio de FONO",
  "Cambio de BOX",
  "Cambio de Conector",
  "Cambio de Roseta",
  "Recableado",
  "Reubicacion",
];
const OPC_IMPUTADO = ["REDES M&D", "WIN"];

function parseHM(s: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function humanDuration(hInicio: string, hFin: string) {
  const a = parseHM(hInicio);
  const b = parseHM(hFin);
  if (a == null || b == null) return "-";
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

function nowLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export function GarantiasClient({ initialYm, initialCanEdit }: { initialYm?: string; initialCanEdit?: boolean }) {
  const [ym, setYm] = useState(initialYm || nowLimaYm());
  const [rows, setRows] = useState<Row[]>([]);
  const [coords, setCoords] = useState<Array<{ uid: string; nombre: string }>>([]);
  const [canEdit, setCanEdit] = useState(!!initialCanEdit);
  const [finalizadasSinGarantia, setFinalizadasSinGarantia] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>({ field: null, dir: "asc" });
  const [reloadTick, setReloadTick] = useState(0);

  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCoord, setFiltroCoord] = useState("");
  const [filtroCuadrilla, setFiltroCuadrilla] = useState("");

  const [editId, setEditId] = useState("");
  const [editForm, setEditForm] = useState({
    motivoGarantia: "",
    diagnosticoGarantia: "",
    solucionGarantia: "",
    responsableGarantia: "",
    casoGarantia: "",
    imputadoGarantia: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ordenes/garantias/list?ym=${encodeURIComponent(ym)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : []);
          setCoords(Array.isArray(data?.options?.coordinadores) ? data.options.coordinadores : []);
          setCanEdit(!!data?.canEdit);
          setFinalizadasSinGarantia(Number(data?.stats?.finalizadasSinGarantia || 0));
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ym, reloadTick]);

  const filtered = useMemo(() => {
    const c = filtroCliente.trim().toLowerCase();
    const q = filtroCuadrilla.trim().toLowerCase();
    return rows.filter((r) => {
      const byFecha = !filtroFecha || r.fechaGarantiaYmd === filtroFecha;
      const byCliente =
        !c ||
        r.cliente.toLowerCase().includes(c) ||
        r.codigoCliente.toLowerCase().includes(c);
      const byEstado = !filtroEstado || r.estado === filtroEstado;
      const byCoord = !filtroCoord || r.coordinadorUid === filtroCoord;
      const byCuad = !q || r.cuadrilla.toLowerCase().includes(q);
      return byFecha && byCliente && byEstado && byCoord && byCuad;
    });
  }, [rows, filtroFecha, filtroCliente, filtroEstado, filtroCoord, filtroCuadrilla]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (!sort.field) return arr;
    arr.sort((a: any, b: any) => {
      const av = a[sort.field!];
      const bv = b[sort.field!];
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
    });
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [filtered, sort]);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page]);

  useEffect(() => {
    setPage(1);
  }, [filtroFecha, filtroCliente, filtroEstado, filtroCoord, filtroCuadrilla, sort.field, sort.dir, ym]);

  const porcentajeGarantias = finalizadasSinGarantia
    ? (sorted.length / finalizadasSinGarantia) * 100
    : 0;

  function toggleSort(field: keyof Row) {
    setSort((s) =>
      s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }
    );
  }

  async function saveEdit(ordenId: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ordenes/garantias/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordenId, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setRows((prev) =>
        prev.map((r) =>
          r.ordenId === ordenId
            ? {
                ...r,
                ...editForm,
                fechaInstalacionBase: String(data?.payload?.fechaInstalacionBase || r.fechaInstalacionBase || ""),
                diasDesdeInstalacion:
                  typeof data?.payload?.diasDesdeInstalacion === "number"
                    ? data.payload.diasDesdeInstalacion
                    : r.diasDesdeInstalacion,
              }
            : r
        )
      );
      setEditId("");
      setReloadTick((v) => v + 1);
      toast.success("Garantia actualizada");
    } catch (e: any) {
      toast.error(String(e?.message || "Error al guardar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Ordenes · Garantias</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Controla casos de garantia, diagnostico, solucion e imputacion por orden.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Total del mes (garantias): <b>{sorted.length}</b>
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          % Garantias (sobre finalizadas sin garantia):{" "}
          <b>{porcentajeGarantias.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</b>{" "}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({sorted.length} / {finalizadasSinGarantia || 0})
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900" />
          <input
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            placeholder="Buscar cliente o codigo"
            className="w-56 rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
          <input
            value={filtroCuadrilla}
            onChange={(e) => setFiltroCuadrilla(e.target.value)}
            placeholder="Buscar cuadrilla"
            className="w-48 rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900">
            <option value="">Todos los estados</option>
            <option value="Agendada">Agendada</option>
            <option value="En camino">En camino</option>
            <option value="Cancelada">Cancelada</option>
            <option value="Finalizada">Finalizada</option>
            <option value="Reprogramada">Reprogramada</option>
            <option value="Iniciada">Iniciada</option>
            <option value="Regestion">Regestion</option>
            <option value="Regestión">Regestion (tilde)</option>
          </select>
          <select value={filtroCoord} onChange={(e) => setFiltroCoord(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900">
            <option value="">Todos los coordinadores</option>
            {coords.map((c) => (
              <option key={c.uid} value={c.uid}>{c.nombre}</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-xl bg-[#30518c] px-3 py-2 text-sm text-white"
            onClick={() => {
              setFiltroFecha("");
              setFiltroCliente("");
              setFiltroEstado("");
              setFiltroCoord("");
              setFiltroCuadrilla("");
              setSort({ field: null, dir: "asc" });
              setEditId("");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {error ? <div className="m-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="m-4 rounded border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cargando garantias...</div> : null}

      <div className="m-4 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-[1900px] w-full text-xs md:text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
            <tr>
              <th className="p-2"><button onClick={() => toggleSort("fechaGarantiaYmd")}>F. Garantia / Cliente / Codigo / F. Instalacion</button></th>
              <th className="p-2"><button onClick={() => toggleSort("plan")}>Plan</button></th>
              <th className="p-2"><button onClick={() => toggleSort("direccion")}>Direccion</button></th>
              <th className="p-2"><button onClick={() => toggleSort("cuadrilla")}>Cuadrilla</button></th>
              <th className="p-2"><button onClick={() => toggleSort("tipoServicio")}>Tipo Servicio</button></th>
              <th className="p-2">Tiempo</th>
              <th className="p-2"><button onClick={() => toggleSort("motivoCancelacion")}>Motivo Cancelacion</button></th>
              <th className="p-2"><button onClick={() => toggleSort("estado")}>Estado</button></th>
              <th className="p-2"><button onClick={() => toggleSort("motivoGarantia")}>Motivo</button></th>
              <th className="p-2"><button onClick={() => toggleSort("diagnosticoGarantia")}>Diagnostico</button></th>
              <th className="p-2"><button onClick={() => toggleSort("solucionGarantia")}>Solucion</button></th>
              <th className="p-2"><button onClick={() => toggleSort("responsableGarantia")}>Responsable</button></th>
              <th className="p-2"><button onClick={() => toggleSort("casoGarantia")}>Caso</button></th>
              <th className="p-2"><button onClick={() => toggleSort("imputadoGarantia")}>Imputado</button></th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r, idx) => {
              const editing = editId === r.ordenId;
              return (
                <tr key={r.id} className={`border-b border-slate-200 dark:border-slate-700 ${idx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/60"}`}>
                  <td className="p-2 max-w-[380px] leading-5">
                    <div><b>F. Garantia:</b> {r.fechaGarantiaYmd || "-"}</div>
                    <div><b>Cliente:</b> {r.cliente || "-"}</div>
                    <div><b>Codigo:</b> {r.codigoCliente || "-"}</div>
                    <div><b>F. Instalacion:</b> {r.fechaInstalacionBase || "-"}</div>
                    <div><b>Dias:</b> {typeof r.diasDesdeInstalacion === "number" ? r.diasDesdeInstalacion : "-"}</div>
                  </td>
                  <td className="p-2">{r.plan || "-"}</td>
                  <td className="p-2 max-w-[260px]">{r.direccion || "-"}</td>
                  <td className="p-2">{r.cuadrilla || "-"}</td>
                  <td className="p-2">{r.tipoServicio || "-"}</td>
                  <td className="p-2">
                    <div><b>Tramo:</b> {r.tramo || "-"}</div>
                    <div><b>H. Inicio:</b> {r.horaInicio || "-"}</div>
                    <div><b>H. Fin:</b> {r.horaFin || "-"}</div>
                    <div><b>Duracion:</b> {humanDuration(r.horaInicio, r.horaFin)}</div>
                  </td>
                  <td className="p-2">{r.motivoCancelacion || "-"}</td>
                  <td className="p-2">{r.estado || "-"}</td>
                  <td className="p-2">
                    {editing ? (
                      <input className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.motivoGarantia} onChange={(e) => setEditForm((f) => ({ ...f, motivoGarantia: e.target.value }))} />
                    ) : (
                      r.motivoGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <input className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.diagnosticoGarantia} onChange={(e) => setEditForm((f) => ({ ...f, diagnosticoGarantia: e.target.value }))} />
                    ) : (
                      r.diagnosticoGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <input className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.solucionGarantia} onChange={(e) => setEditForm((f) => ({ ...f, solucionGarantia: e.target.value }))} />
                    ) : (
                      r.solucionGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <select className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.responsableGarantia} onChange={(e) => setEditForm((f) => ({ ...f, responsableGarantia: e.target.value }))}>
                        <option value="">--</option>
                        {OPC_RESPONSABLE.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ) : (
                      r.responsableGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <select className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.casoGarantia} onChange={(e) => setEditForm((f) => ({ ...f, casoGarantia: e.target.value }))}>
                        <option value="">--</option>
                        {OPC_CASO.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ) : (
                      r.casoGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <select className="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={editForm.imputadoGarantia} onChange={(e) => setEditForm((f) => ({ ...f, imputadoGarantia: e.target.value }))}>
                        <option value="">--</option>
                        {OPC_IMPUTADO.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ) : (
                      r.imputadoGarantia || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing && canEdit ? (
                      <div className="flex gap-2">
                        <button disabled={saving} className="rounded bg-emerald-600 px-2 py-1 text-white" onClick={() => saveEdit(r.ordenId)}>Guardar</button>
                        <button className="rounded bg-slate-500 px-2 py-1 text-white" onClick={() => setEditId("")}>Cancelar</button>
                      </div>
                    ) : canEdit ? (
                      <button
                        className="rounded bg-[#30518c] px-2 py-1 text-white"
                        onClick={() => {
                          setEditId(r.ordenId);
                          setEditForm({
                            motivoGarantia: r.motivoGarantia || "",
                            diagnosticoGarantia: r.diagnosticoGarantia || "",
                            solucionGarantia: r.solucionGarantia || "",
                            responsableGarantia: r.responsableGarantia || "",
                            casoGarantia: r.casoGarantia || "",
                            imputadoGarantia: r.imputadoGarantia || "",
                          });
                        }}
                      >
                        Editar
                      </button>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700 dark:text-slate-100">Solo lectura</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && pageData.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-6 text-center text-slate-500 dark:text-slate-300">No hay garantias para los filtros seleccionados</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > 0 ? (
        <div className="m-4 flex items-center justify-center gap-3">
          <button className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-600" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-sm text-slate-600 dark:text-slate-300">Pagina <b>{page}</b> de <b>{totalPages}</b></span>
          <button className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-600" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
        </div>
      ) : null}
      </section>
    </div>
  );
}
