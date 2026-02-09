"use client";

import React, { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  marcarAuditoriaAction,
  moverEquipoManualAction,
  quitarAuditoriaAction,
} from "../server-actions";

type EquipoRow = {
  id: string;
  SN?: string;
  equipo?: string;
  descripcion?: string;
  ubicacion?: string;
  estado?: string;
  pri_tec?: string;
  tec_liq?: string;
  inv?: string;
  auditoria?: {
    requiere?: boolean;
    estado?: string;
    fotoPath?: string;
    fotoURL?: string;
    marcadoPor?: string;
    actualizadoEn?: any;
  };
};

type CuadrillaRow = {
  id: string;
  nombre?: string;
};

function normalizeUbicacionList(base: string[]) {
  return Array.from(new Set(base.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function EquiposClient({
  initialEquipos,
  initialCuadrillas,
  canEdit,
}: {
  initialEquipos: EquipoRow[];
  initialCuadrillas: CuadrillaRow[];
  canEdit: boolean;
}) {
  const [equipos, setEquipos] = useState<EquipoRow[]>(initialEquipos || []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextUbicacion, setNextUbicacion] = useState<string>("");
  const [selectedDescs, setSelectedDescs] = useState<Set<string>>(new Set());
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroUbicacion, setFiltroUbicacion] = useState("");
  const [filtroPriTec, setFiltroPriTec] = useState("");
  const [filtroTecLiq, setFiltroTecLiq] = useState("");
  const [filtroInv, setFiltroInv] = useState("");
  const [descQuery, setDescQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const cuadrillas = useMemo(
    () => (initialCuadrillas || []).map((c) => ({ id: c.id, nombre: String(c.nombre || "").trim() })).filter((c) => c.nombre),
    [initialCuadrillas]
  );
  const cuadrillaByNombre = useMemo(() => {
    const m = new Map<string, string>();
    cuadrillas.forEach((c) => m.set(String(c.nombre || "").toUpperCase(), c.id));
    return m;
  }, [cuadrillas]);

  const ubicacionesBase = useMemo(() => {
    const base = [
      "ALMACEN",
      "AVERIA",
      "GARANTIA",
      "PERDIDO",
      "ROBO",
      "WIN",
      "INSTALADOS",
      ...cuadrillas.map((c) => c.nombre || ""),
    ];
    return normalizeUbicacionList(base);
  }, [cuadrillas]);

  const estadosDisponibles = useMemo(() => {
    return normalizeUbicacionList(
      (equipos || []).map((e) => String(e.estado || "").trim()).filter(Boolean)
    );
  }, [equipos]);

  const descripcionesDisponibles = useMemo(() => {
    return normalizeUbicacionList(
      (equipos || []).map((e) => String(e.descripcion || "").trim()).filter(Boolean)
    );
  }, [equipos]);

  const descripcionesFiltradas = useMemo(() => {
    const q = descQuery.trim().toLowerCase();
    if (!q) return descripcionesDisponibles;
    return descripcionesDisponibles.filter((d) => d.toLowerCase().includes(q));
  }, [descripcionesDisponibles, descQuery]);

  const equiposFiltrados = useMemo(() => {
    return (equipos || []).filter((e) => {
      if (filtroEstado && String(e.estado || "") !== filtroEstado) return false;
      if (filtroUbicacion && String(e.ubicacion || "") !== filtroUbicacion) return false;
      if (filtroPriTec && String(e.pri_tec || "") !== filtroPriTec) return false;
      if (filtroTecLiq && String(e.tec_liq || "") !== filtroTecLiq) return false;
      if (filtroInv && String(e.inv || "") !== filtroInv) return false;
      if (selectedDescs.size > 0) {
        const d = String(e.descripcion || "").trim();
        if (!selectedDescs.has(d)) return false;
      }
      return true;
    });
  }, [equipos, filtroEstado, filtroUbicacion, filtroPriTec, filtroTecLiq, filtroInv, selectedDescs]);

  const startEdit = (row: EquipoRow) => {
    setEditingId(row.id);
    setNextUbicacion(String(row.ubicacion || ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNextUbicacion("");
  };

  const saveMove = (row: EquipoRow) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    const toUb = String(nextUbicacion || "").trim();
    if (!toUb) {
      toast.error("Selecciona ubicacion");
      return;
    }
    const fromUb = String(row.ubicacion || "").trim().toUpperCase();
    const toUbKey = toUb.toUpperCase();
    const fromCuadrillaId = cuadrillaByNombre.get(fromUb) || undefined;
    const toCuadrillaId = cuadrillaByNombre.get(toUbKey) || undefined;

    startTransition(async () => {
      try {
        const r = await moverEquipoManualAction({
          sn,
          toUbicacion: toUb,
          fromCuadrillaId,
          toCuadrillaId,
        });
        if (!r?.ok) throw new Error("MOVE_FAIL");
        setEquipos((prev) =>
          prev.map((e) =>
            e.id === row.id
              ? { ...e, ubicacion: r.ubicacion, estado: r.estado }
              : e
          )
        );
        toast.success("Equipo actualizado");
        cancelEdit();
      } catch (e: any) {
        toast.error(String(e?.message || "No se pudo mover el equipo"));
      }
    });
  };

  const marcarAuditoria = (row: EquipoRow) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    startTransition(async () => {
      try {
        const r = await marcarAuditoriaAction({ sn });
        if (!r?.ok) throw new Error("AUDIT_FAIL");
        setEquipos((prev) =>
          prev.map((e) => (e.id === row.id ? { ...e, auditoria: r.auditoria } : e))
        );
        toast.success("Marcado para sustentar");
      } catch {
        toast.error("No se pudo marcar");
      }
    });
  };

  const quitarAuditoria = (row: EquipoRow) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    startTransition(async () => {
      try {
        const r = await quitarAuditoriaAction({ sn });
        if (!r?.ok) throw new Error("AUDIT_CLEAR_FAIL");
        setEquipos((prev) =>
          prev.map((e) => (e.id === row.id ? { ...e, auditoria: undefined } : e))
        );
        toast.success("Auditoria eliminada");
      } catch {
        toast.error("No se pudo quitar");
      }
    });
  };

  const toggleDesc = (desc: string, checked: boolean) => {
    setSelectedDescs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(desc);
      else next.delete(desc);
      return next;
    });
  };

  const clearFilters = () => {
    setFiltroEstado("");
    setFiltroUbicacion("");
    setFiltroPriTec("");
    setFiltroTecLiq("");
    setFiltroInv("");
    setSelectedDescs(new Set());
    setDescQuery("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">Estado</option>
          {estadosDisponibles.map((estado) => (
            <option key={estado} value={estado}>
              {estado}
            </option>
          ))}
        </select>

        <select
          value={filtroUbicacion}
          onChange={(e) => setFiltroUbicacion(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">Ubicacion</option>
          {ubicacionesBase.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <select
          value={filtroPriTec}
          onChange={(e) => setFiltroPriTec(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">PRI-TEC</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <select
          value={filtroTecLiq}
          onChange={(e) => setFiltroTecLiq(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">TEC-LIQ</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <select
          value={filtroInv}
          onChange={(e) => setFiltroInv(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">INV</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <button
          type="button"
          onClick={clearFilters}
          className="rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Limpiar filtros
        </button>
      </div>

      <div className="rounded border p-3">
        <div className="text-sm font-medium">Filtro por descripcion</div>
        <div className="mt-2 flex gap-2">
          <input
            value={descQuery}
            onChange={(e) => setDescQuery(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            placeholder="Buscar descripcion..."
          />
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setSelectedDescs(new Set())}
          >
            Limpiar
          </button>
        </div>
        <div className="mt-2 max-h-40 overflow-auto text-xs">
          {descripcionesFiltradas.length === 0 ? (
            <div className="text-muted-foreground">Sin descripciones</div>
          ) : (
            descripcionesFiltradas.map((d) => (
              <label key={d} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedDescs.has(d)}
                  onChange={(e) => toggleDesc(d, e.target.checked)}
                />
                <span>{d}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="rounded border overflow-auto">
        <table className="min-w-[1100px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">SN</th>
              <th className="p-2">Equipo</th>
              <th className="p-2">Descripcion</th>
              <th className="p-2">Ubicacion</th>
              <th className="p-2">Estado</th>
              <th className="p-2">PRI-TEC</th>
              <th className="p-2">TEC-LIQ</th>
              <th className="p-2">INV</th>
              <th className="p-2">Accion</th>
            </tr>
          </thead>
          <tbody>
            {equiposFiltrados.map((e) => {
              const isEditing = editingId === e.id;
              return (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-mono">{e.SN || e.id}</td>
                  <td className="p-2">{e.equipo || "-"}</td>
                  <td className="p-2">{e.descripcion || "-"}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <select
                        value={nextUbicacion}
                        onChange={(ev) => setNextUbicacion(ev.target.value)}
                        className="rounded border px-2 py-1"
                      >
                        <option value="">Selecciona</option>
                        {ubicacionesBase.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    ) : (
                      e.ubicacion || "-"
                    )}
                  </td>
                  <td className="p-2">{e.estado || "-"}</td>
                  <td className="p-2">{e.pri_tec || "-"}</td>
                  <td className="p-2">{e.tec_liq || "-"}</td>
                  <td className="p-2">{e.inv || "-"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {canEdit && (
                        <>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="rounded bg-emerald-600 px-3 py-1 text-white"
                                onClick={() => saveMove(e)}
                                disabled={isPending}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="rounded bg-gray-300 px-3 py-1"
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="rounded bg-blue-600 px-3 py-1 text-white"
                              onClick={() => startEdit(e)}
                            >
                              Mover
                            </button>
                          )}
                        </>
                      )}
                      {canEdit && (
                        <>
                          {e.auditoria?.requiere ? (
                            <button
                              type="button"
                              className="rounded bg-red-600 px-3 py-1 text-white"
                              onClick={() => quitarAuditoria(e)}
                              disabled={isPending}
                            >
                              Quitar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded bg-amber-600 px-3 py-1 text-white"
                              onClick={() => marcarAuditoria(e)}
                              disabled={isPending}
                            >
                              Sustentar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {equiposFiltrados.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
