"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type OptionItem = { uid: string; nombre: string };
type ScopeInfo = {
  isCoordinatorScope?: boolean;
  viewerCoordinatorUid?: string | null;
  viewerCoordinatorNombre?: string | null;
};

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  plan: string;
  direccion: string;
  telefono: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  tipoServicio: string;
  tramoBase: string;
  tramoNombre: string;
  estado: string;
  fechaFinVisiYmd: string;
  fechaFinVisiHm: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  estadoLlamada: string;
  observacionLlamada: string;
};

type Filters = {
  cliente: string;
  gestorUid: string;
  tramoBase: string;
  estado: string;
  coordinadorUid: string;
  cuadrilla: string;
  estadoLlamada: string;
};

const emptyFilters: Filters = {
  cliente: "",
  gestorUid: "",
  tramoBase: "",
  estado: "",
  coordinadorUid: "",
  cuadrilla: "",
  estadoLlamada: "",
};

type EditForm = {
  telefono: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  estadoLlamada: string;
  observacionLlamada: string;
};

function estadoChipClass(estado: string) {
  if (estado === "Finalizada") return "bg-emerald-100 text-emerald-800";
  if (estado === "Cancelada") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-800";
}

function callStatusChipClass(estadoLlamada: string) {
  if (estadoLlamada === "Contesto") return "bg-emerald-100 text-emerald-800";
  if (estadoLlamada === "No Contesto") return "bg-amber-100 text-amber-800";
  if (estadoLlamada === "No se Registro") return "bg-slate-200 text-slate-900";
  return "bg-yellow-100 text-yellow-800";
}

function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function nowLimaHms() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function initialForm(row: Row): EditForm {
  return {
    telefono: row.telefono || "",
    horaInicioLlamada: row.horaInicioLlamada || "",
    horaFinLlamada: row.horaFinLlamada || "",
    estadoLlamada: row.estadoLlamada || "",
    observacionLlamada: row.observacionLlamada || "",
  };
}

export function LlamadasClient({
  initialYmd,
  initialCanEdit = false,
}: {
  initialYmd: string;
  initialCanEdit?: boolean;
}) {
  const [ymd, setYmd] = useState(initialYmd);
  const [clock, setClock] = useState(nowLimaHms());
  const [rows, setRows] = useState<Row[]>([]);
  const [canEdit, setCanEdit] = useState(initialCanEdit);
  const [gestores, setGestores] = useState<OptionItem[]>([]);
  const [coordinadores, setCoordinadores] = useState<OptionItem[]>([]);
  const [scope, setScope] = useState<ScopeInfo>({});
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  const [editId, setEditId] = useState<string>("");
  const [editForm, setEditForm] = useState<EditForm>({
    telefono: "",
    horaInicioLlamada: "",
    horaFinLlamada: "",
    estadoLlamada: "",
    observacionLlamada: "",
  });
  const [saving, setSaving] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  const clienteDeb = useDebouncedValue(filters.cliente);
  const cuadrillaDeb = useDebouncedValue(filters.cuadrilla);

  useEffect(() => {
    const timer = setInterval(() => setClock(nowLimaHms()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const fetchData = async () => {
      if (!bootstrapped) setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ordenes/llamadas/list?ymd=${encodeURIComponent(ymd)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : []);
          setGestores(Array.isArray(data?.options?.gestores) ? data.options.gestores : []);
          setCoordinadores(Array.isArray(data?.options?.coordinadores) ? data.options.coordinadores : []);
          setScope((data?.scope || {}) as ScopeInfo);
          setCanEdit(!!data?.canEdit);
          setBootstrapped(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled && !bootstrapped) setLoading(false);
      }
    };

    fetchData();
    const poll = editId ? null : setInterval(fetchData, 15000);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (poll) clearInterval(poll);
    };
  }, [ymd, reloadTick, editId, bootstrapped]);

  useEffect(() => {
    if (!scope?.isCoordinatorScope) return;
    const ownUid = String(scope.viewerCoordinatorUid || "").trim();
    if (!ownUid) return;
    setFilters((prev) => (prev.coordinadorUid === ownUid ? prev : { ...prev, coordinadorUid: ownUid }));
  }, [scope]);

  const filtered = useMemo(() => {
    const cli = clienteDeb.trim().toLowerCase();
    const cuad = cuadrillaDeb.trim().toLowerCase();
    return rows.filter((r) => {
      const byCliente = !cli || `${r.cliente} ${r.codigoCliente}`.toLowerCase().includes(cli);
      const byGestor = !filters.gestorUid || r.gestorUid === filters.gestorUid;
      const byTramo = !filters.tramoBase || r.tramoBase === filters.tramoBase;
      const byEstado = !filters.estado || r.estado === filters.estado;
      const byCoord = !filters.coordinadorUid || r.coordinadorUid === filters.coordinadorUid;
      const byCuad = !cuad || `${r.cuadrillaNombre} ${r.cuadrillaId}`.toLowerCase().includes(cuad);
      const byEstadoLlamada =
        !filters.estadoLlamada ||
        (filters.estadoLlamada === "noLlamo" && !r.estadoLlamada) ||
        r.estadoLlamada === filters.estadoLlamada;
      return byCliente && byGestor && byTramo && byEstado && byCoord && byCuad && byEstadoLlamada;
    });
  }, [rows, clienteDeb, cuadrillaDeb, filters]);

  const counters = useMemo(() => {
    const total = rows.length;
    const noLlamo = rows.filter((r) => !r.estadoLlamada).length;
    const contesto = rows.filter((r) => r.estadoLlamada === "Contesto").length;
    const noContesto = rows.filter((r) => r.estadoLlamada === "No Contesto").length;
    const noRegistro = rows.filter((r) => r.estadoLlamada === "No se Registro").length;
    return { total, noLlamo, contesto, noContesto, noRegistro };
  }, [rows]);

  useEffect(() => {
    setPage(1);
  }, [clienteDeb, cuadrillaDeb, filters.gestorUid, filters.tramoBase, filters.estado, filters.coordinadorUid, filters.estadoLlamada]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  function downloadExcel() {
    const rowsExport = filtered.map((r) => ({
      Cliente: r.cliente || "",
      Codigo: r.codigoCliente || "",
      Documento: r.documento || "",
      Plan: r.plan || "",
      Direccion: r.direccion || "",
      Telefono: r.telefono || "",
      Cuadrilla: r.cuadrillaNombre || r.cuadrillaId || "",
      Gestor: r.gestorNombre || "",
      Coordinador: r.coordinadorNombre || "",
      Tipo_Servicio: r.tipoServicio || "",
      Tramo: r.tramoNombre || "",
      Estado_Orden: r.estado || "",
      Inicio_Llamada: r.horaInicioLlamada || "",
      Fin_Llamada: r.horaFinLlamada || "",
      Estado_Llamada: r.estadoLlamada || "No se llamo",
      Observacion: r.observacionLlamada || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rowsExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Llamadas");
    XLSX.writeFile(wb, `ordenes_llamadas_${ymd}.xlsx`);
  }

  async function handleSave(ordenId: string) {
    if (!canEdit) {
      toast.error("No tienes permiso para editar.");
      return;
    }
    if (!editForm.estadoLlamada) {
      toast.error("El estado de llamada es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ordenes/llamadas/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordenId, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));

      setRows((prev) => prev.map((r) => (r.ordenId === ordenId ? { ...r, ...editForm } : r)));
      setEditId("");
      toast.success("Gestion de llamada guardada.");
      setReloadTick((v) => v + 1);
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  }

  function resetFilters() {
    setFilters({
      ...emptyFilters,
      coordinadorUid: scope?.isCoordinatorScope ? String(scope.viewerCoordinatorUid || "") : "",
    });
    setPage(1);
    setEditId("");
  }

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Ordenes · Gestion de llamadas</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Monitorea el estado de llamadas, filtra por responsables y gestiona registros en tiempo real.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="space-y-3">
              <div className="text-center text-lg font-semibold tracking-wide text-[#30518c] dark:text-blue-300">
                Hora Lima: {clock}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <div className="rounded bg-slate-100 px-3 py-1.5 dark:bg-slate-700/70 dark:text-slate-100">Total del dia: {counters.total}</div>
                <div className="rounded bg-yellow-100 px-3 py-1.5 text-yellow-900">No se llamo: {counters.noLlamo}</div>
                <div className="rounded bg-emerald-100 px-3 py-1.5 text-emerald-900">Contesto: {counters.contesto}</div>
                <div className="rounded bg-amber-100 px-3 py-1.5 text-amber-900">No contesto: {counters.noContesto}</div>
                <div className="rounded bg-slate-200 px-3 py-1.5 text-slate-900 dark:bg-slate-600 dark:text-slate-100">No se registro: {counters.noRegistro}</div>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs">Fecha</label>
                  <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className="ui-input-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs">Cliente</label>
                  <input value={filters.cliente} onChange={(e) => setFilters((f) => ({ ...f, cliente: e.target.value }))} placeholder="Nombre o codigo" className="ui-input-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs">Tramo</label>
                  <select value={filters.tramoBase} onChange={(e) => setFilters((f) => ({ ...f, tramoBase: e.target.value }))} className="ui-select-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                    <option value="">Todos</option>
                    <option value="08:00">Primer Tramo</option>
                    <option value="12:00">Segundo Tramo</option>
                    <option value="16:00">Tercer Tramo</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs">Coordinador</label>
                  <select value={filters.coordinadorUid} onChange={(e) => setFilters((f) => ({ ...f, coordinadorUid: e.target.value }))} disabled={!!scope?.isCoordinatorScope} className="ui-select-inline min-w-48 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                    {!scope?.isCoordinatorScope ? <option value="">Todos</option> : null}
                    {coordinadores.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs">Gestor</label>
                  <select value={filters.gestorUid} onChange={(e) => setFilters((f) => ({ ...f, gestorUid: e.target.value }))} className="ui-select-inline min-w-48 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                    <option value="">Todos</option>
                    {gestores.map((g) => (
                      <option key={g.uid} value={g.uid}>
                        {g.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs">Estado orden</label>
                  <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className="ui-select-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                    <option value="">Todos</option>
                    <option value="Agendada">Agendada</option>
                    <option value="En camino">En camino</option>
                    <option value="Cancelada">Cancelada</option>
                    <option value="Finalizada">Finalizada</option>
                    <option value="Reprogramada">Reprogramada</option>
                    <option value="Iniciada">Iniciada</option>
                    <option value="Regestion">Regestion</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs">Cuadrilla</label>
                  <input value={filters.cuadrilla} onChange={(e) => setFilters((f) => ({ ...f, cuadrilla: e.target.value }))} placeholder="K1 RESIDENCIAL" className="ui-input-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs">Estado llamada</label>
                  <select value={filters.estadoLlamada} onChange={(e) => setFilters((f) => ({ ...f, estadoLlamada: e.target.value }))} className="ui-select-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                    <option value="">Todos</option>
                    <option value="Contesto">Contesto</option>
                    <option value="No Contesto">No Contesto</option>
                    <option value="No se Registro">No se Registro</option>
                    <option value="noLlamo">No se llamo</option>
                  </select>
                </div>
                <button type="button" className="rounded-xl bg-[#30518c] px-3 py-2 text-sm text-white" onClick={resetFilters}>
                  Limpiar filtros
                </button>
                <button type="button" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" onClick={downloadExcel}>
                  Descargar Excel
                </button>
              </div>
            </div>
          </div>
        </div>

        {error ? <div className="m-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <div className="m-4 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? (
            <div className="p-4 text-sm text-slate-500 dark:text-slate-300">Cargando ordenes...</div>
          ) : (
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                <tr>
                  {[
                    "Cliente",
                    "Codigo",
                    "Documento",
                    "Plan",
                    "Direccion",
                    "Telefono",
                    "Cuadrilla",
                    "Gestor",
                    "Coordinador",
                    "Tipo Servicio",
                    "Tramo",
                    "Estado",
                    "Inicio Llamada",
                    "Fin Llamada",
                    "Estado Llamada",
                    "Observacion",
                    "Accion",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isEditing = editId === r.ordenId;
                  return (
                    <tr key={r.id} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/60">
                      <td className="px-2 py-2">{r.cliente || "-"}</td>
                      <td className="px-2 py-2">{r.codigoCliente || "-"}</td>
                      <td className="px-2 py-2">{r.documento || "-"}</td>
                      <td className="max-w-80 px-2 py-2">{r.plan || "-"}</td>
                      <td className="max-w-96 px-2 py-2">{r.direccion || "-"}</td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <input value={editForm.telefono} onChange={(e) => setEditForm((f) => ({ ...f, telefono: e.target.value }))} className="ui-input-inline w-36 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" />
                        ) : (
                          r.telefono || "-"
                        )}
                      </td>
                      <td className="px-2 py-2">{r.cuadrillaNombre || r.cuadrillaId || "-"}</td>
                      <td className="px-2 py-2">{r.gestorNombre || "-"}</td>
                      <td className="px-2 py-2">{r.coordinadorNombre || "-"}</td>
                      <td className="px-2 py-2">{r.tipoServicio || "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.tramoNombre}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${estadoChipClass(r.estado)}`}>{r.estado || "-"}</span>
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <input type="time" value={editForm.horaInicioLlamada} onChange={(e) => setEditForm((f) => ({ ...f, horaInicioLlamada: e.target.value }))} className="ui-input-inline w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" />
                        ) : (
                          r.horaInicioLlamada || "-"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <input type="time" value={editForm.horaFinLlamada} onChange={(e) => setEditForm((f) => ({ ...f, horaFinLlamada: e.target.value }))} className="ui-input-inline w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" />
                        ) : (
                          r.horaFinLlamada || "-"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <select value={editForm.estadoLlamada} onChange={(e) => setEditForm((f) => ({ ...f, estadoLlamada: e.target.value }))} className="ui-select-inline w-36 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900">
                            <option value="">--</option>
                            <option value="Contesto">Contesto</option>
                            <option value="No Contesto">No Contesto</option>
                            <option value="No se Registro">No se Registro</option>
                          </select>
                        ) : (
                          <span className={`rounded px-2 py-0.5 text-xs ${callStatusChipClass(r.estadoLlamada)}`}>{r.estadoLlamada || "No se llamo"}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <input value={editForm.observacionLlamada} onChange={(e) => setEditForm((f) => ({ ...f, observacionLlamada: e.target.value }))} className="ui-input-inline w-64 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" />
                        ) : (
                          r.observacionLlamada || "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {isEditing && canEdit ? (
                          <div className="flex gap-1">
                            <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-60" disabled={saving} onClick={() => handleSave(r.ordenId)}>
                              Guardar
                            </button>
                            <button type="button" className="rounded bg-slate-500 px-2 py-1 text-xs text-white" onClick={() => setEditId("")}>
                              Cancelar
                            </button>
                          </div>
                        ) : canEdit ? (
                          <button
                            type="button"
                            className="rounded bg-[#30518c] px-2 py-1 text-xs text-white"
                            onClick={() => {
                              setEditId(r.ordenId);
                              setEditForm(initialForm(r));
                            }}
                          >
                            Editar
                          </button>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-100">Solo lectura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-2 py-8 text-center text-sm text-slate-500 dark:text-slate-300">
                      No hay ordenes para los filtros seleccionados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        {!loading && filtered.length > 0 ? (
          <div className="m-4 flex items-center justify-center gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-60 dark:border-slate-600" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Anterior
            </button>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Pagina {page} de {totalPages}
            </div>
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-60 dark:border-slate-600" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Siguiente
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
