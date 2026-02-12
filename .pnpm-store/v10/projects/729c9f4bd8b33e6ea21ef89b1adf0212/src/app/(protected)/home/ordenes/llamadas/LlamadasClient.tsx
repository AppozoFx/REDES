"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type OptionItem = { uid: string; nombre: string };

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

  const filtered = useMemo(() => {
    const cli = clienteDeb.trim().toLowerCase();
    const cuad = cuadrillaDeb.trim().toLowerCase();
    return rows.filter((r) => {
      const byCliente = !cli || `${r.cliente} ${r.codigoCliente}`.toLowerCase().includes(cli);
      const byGestor = !filters.gestorUid || r.gestorUid === filters.gestorUid;
      const byTramo = !filters.tramoBase || r.tramoBase === filters.tramoBase;
      const byEstado = !filters.estado || r.estado === filters.estado;
      const byCoord = !filters.coordinadorUid || r.coordinadorUid === filters.coordinadorUid;
      const byCuad =
        !cuad || `${r.cuadrillaNombre} ${r.cuadrillaId}`.toLowerCase().includes(cuad);
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

      setRows((prev) =>
        prev.map((r) => (r.ordenId === ordenId ? { ...r, ...editForm } : r))
      );
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
    setFilters(emptyFilters);
    setPage(1);
    setEditId("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">Hora Lima: {clock}</div>
          <div className="text-sm text-muted-foreground">
            {canEdit ? "Modo: Edicion habilitada" : "Modo: Solo lectura"} | Actualizacion automatica: 15s
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded bg-slate-100 px-3 py-1.5">Total del dia: {counters.total}</div>
          <div className="rounded bg-yellow-100 px-3 py-1.5 text-yellow-900">No se llamo: {counters.noLlamo}</div>
          <div className="rounded bg-emerald-100 px-3 py-1.5 text-emerald-900">Contesto: {counters.contesto}</div>
          <div className="rounded bg-amber-100 px-3 py-1.5 text-amber-900">No contesto: {counters.noContesto}</div>
          <div className="rounded bg-slate-200 px-3 py-1.5 text-slate-900">No se registro: {counters.noRegistro}</div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs mb-1">Fecha</label>
            <input
              type="date"
              value={ymd}
              onChange={(e) => setYmd(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Cliente</label>
            <input
              value={filters.cliente}
              onChange={(e) => setFilters((f) => ({ ...f, cliente: e.target.value }))}
              placeholder="Nombre o codigo"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Tramo</label>
            <select
              value={filters.tramoBase}
              onChange={(e) => setFilters((f) => ({ ...f, tramoBase: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="08:00">Primer Tramo</option>
              <option value="12:00">Segundo Tramo</option>
              <option value="16:00">Tercer Tramo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Coordinador</label>
            <select
              value={filters.coordinadorUid}
              onChange={(e) => setFilters((f) => ({ ...f, coordinadorUid: e.target.value }))}
              className="rounded border px-3 py-2 text-sm min-w-48"
            >
              <option value="">Todos</option>
              {coordinadores.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Gestor</label>
            <select
              value={filters.gestorUid}
              onChange={(e) => setFilters((f) => ({ ...f, gestorUid: e.target.value }))}
              className="rounded border px-3 py-2 text-sm min-w-48"
            >
              <option value="">Todos</option>
              {gestores.map((g) => (
                <option key={g.uid} value={g.uid}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Estado orden</label>
            <select
              value={filters.estado}
              onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
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
            <label className="block text-xs mb-1">Cuadrilla</label>
            <input
              value={filters.cuadrilla}
              onChange={(e) => setFilters((f) => ({ ...f, cuadrilla: e.target.value }))}
              placeholder="K1 RESIDENCIAL"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Estado llamada</label>
            <select
              value={filters.estadoLlamada}
              onChange={(e) => setFilters((f) => ({ ...f, estadoLlamada: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="Contesto">Contesto</option>
              <option value="No Contesto">No Contesto</option>
              <option value="No se Registro">No se Registro</option>
              <option value="noLlamo">No se llamo</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded bg-slate-900 text-white px-3 py-2 text-sm"
            onClick={resetFilters}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="overflow-auto rounded-lg border">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Cargando ordenes...</div>
        ) : (
          <table className="w-full min-w-[1600px] text-sm">
            <thead className="bg-slate-100 text-slate-900">
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
                  <th key={h} className="px-2 py-2 text-left whitespace-nowrap border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const isEditing = editId === r.ordenId;
                return (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/50">
                    <td className="px-2 py-2">{r.cliente || "-"}</td>
                    <td className="px-2 py-2">{r.codigoCliente || "-"}</td>
                    <td className="px-2 py-2">{r.documento || "-"}</td>
                    <td className="px-2 py-2 max-w-80">{r.plan || "-"}</td>
                    <td className="px-2 py-2 max-w-96">{r.direccion || "-"}</td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.telefono}
                          onChange={(e) => setEditForm((f) => ({ ...f, telefono: e.target.value }))}
                          className="w-36 rounded border px-2 py-1 text-xs"
                        />
                      ) : (
                        r.telefono || "-"
                      )}
                    </td>
                    <td className="px-2 py-2">{r.cuadrillaNombre || r.cuadrillaId || "-"}</td>
                    <td className="px-2 py-2">{r.gestorNombre || "-"}</td>
                    <td className="px-2 py-2">{r.coordinadorNombre || "-"}</td>
                    <td className="px-2 py-2">{r.tipoServicio || "-"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.tramoNombre}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${estadoChipClass(r.estado)}`}>
                        {r.estado || "-"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="time"
                          value={editForm.horaInicioLlamada}
                          onChange={(e) => setEditForm((f) => ({ ...f, horaInicioLlamada: e.target.value }))}
                          className="w-28 rounded border px-2 py-1 text-xs"
                        />
                      ) : (
                        r.horaInicioLlamada || "-"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="time"
                          value={editForm.horaFinLlamada}
                          onChange={(e) => setEditForm((f) => ({ ...f, horaFinLlamada: e.target.value }))}
                          className="w-28 rounded border px-2 py-1 text-xs"
                        />
                      ) : (
                        r.horaFinLlamada || "-"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.estadoLlamada}
                          onChange={(e) => setEditForm((f) => ({ ...f, estadoLlamada: e.target.value }))}
                          className="w-36 rounded border px-2 py-1 text-xs"
                        >
                          <option value="">--</option>
                          <option value="Contesto">Contesto</option>
                          <option value="No Contesto">No Contesto</option>
                          <option value="No se Registro">No se Registro</option>
                        </select>
                      ) : (
                        <span className={`rounded px-2 py-0.5 text-xs ${callStatusChipClass(r.estadoLlamada)}`}>
                          {r.estadoLlamada || "No se llamo"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.observacionLlamada}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, observacionLlamada: e.target.value }))
                          }
                          className="w-64 rounded border px-2 py-1 text-xs"
                        />
                      ) : (
                        r.observacionLlamada || "-"
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {isEditing && canEdit ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-emerald-600 text-white px-2 py-1 text-xs disabled:opacity-60"
                            disabled={saving}
                            onClick={() => handleSave(r.ordenId)}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="rounded bg-slate-500 text-white px-2 py-1 text-xs"
                            onClick={() => setEditId("")}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : canEdit ? (
                        <button
                          type="button"
                          className="rounded bg-blue-600 text-white px-2 py-1 text-xs"
                          onClick={() => {
                            setEditId(r.ordenId);
                            setEditForm(initialForm(r));
                          }}
                        >
                          Editar
                        </button>
                      ) : (
                        <span className="rounded bg-slate-100 text-slate-700 px-2 py-1 text-xs">
                          Solo lectura
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-2 py-8 text-center text-sm text-muted-foreground">
                    No hay ordenes para los filtros seleccionados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm disabled:opacity-60"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <div className="text-sm">
            Pagina {page} de {totalPages}
          </div>
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm disabled:opacity-60"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
