"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  marcarAuditoriaAction,
  moverEquipoManualAction,
  quitarAuditoriaAction,
} from "../server-actions";
import * as XLSX from "xlsx";

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

type CuadrillaRow = { id: string; nombre?: string };

type ListResponse = {
  ok: boolean;
  items: EquipoRow[];
  nextCursor?: string | null;
  hasMore?: boolean;
  cuadrillas?: CuadrillaRow[];
};

function normalizeList(base: string[]) {
  return Array.from(new Set(base.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function EquiposClient({ canEdit }: { canEdit: boolean }) {
  const [equipos, setEquipos] = useState<EquipoRow[]>([]);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextUbicacion, setNextUbicacion] = useState<string>("");
  const [editCaso, setEditCaso] = useState<string>("");
  const [editObs, setEditObs] = useState<string>("");

  const [snQuery, setSnQuery] = useState("");
  const [snFilter, setSnFilter] = useState("");
  const [filtroEstados, setFiltroEstados] = useState<Set<string>>(new Set());
  const [filtroUbicacion, setFiltroUbicacion] = useState("");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [filtroPriTec, setFiltroPriTec] = useState("");
  const [filtroTecLiq, setFiltroTecLiq] = useState("");
  const [filtroInv, setFiltroInv] = useState("");
  const [selectedDescs, setSelectedDescs] = useState<Set<string>>(new Set());
  const [exactSearch, setExactSearch] = useState(false);
  const [descOptions, setDescOptions] = useState<string[]>([]);
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    if (!estadoOpen && !descOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-dd='estado']")) return;
      if (t.closest("[data-dd='desc']")) return;
      setEstadoOpen(false);
      setDescOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [estadoOpen, descOpen]);

  const [isPending, startTransition] = useTransition();

  const exportFilename = (suffix: string, includeFilters = true) => {
    const d = new Date();
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let name = `EQUIPOS-${ds}-${suffix}`;
    if (includeFilters) {
      if (selectedDescs.size > 0) {
        name += `-${Array.from(selectedDescs).join("_")}`;
      }
      if (filtroEquipo) {
        name += `-${filtroEquipo}`;
      }
    }
    return `${name}.xlsx`;
  };

  const mapExportRow = (e: any) => ({
    SN: e.SN || e.id,
    "F. Despacho": e.f_despachoYmd || "",
    Tecnicos: Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : e.tecnicos || "",
    "F. Instalacion": e.f_instaladoYmd || "",
    Cliente: e.cliente || "",
    "F. Ingreso": e.f_ingresoYmd || "",
    Estado: e.estado || "",
    Ubicacion: e.ubicacion || "",
    Equipo: e.equipo || "",
    Caso: e.caso || "",
    Observacion: e.observacion || "",
    "Pri-Tec": e.pri_tec || "",
    "Tec-Liq": e.tec_liq || "",
    Inv: e.inv || "",
  });

  const resumenByEquipo = useMemo(() => {
    const map = new Map<string, number>();
    equipos.forEach((e: any) => {
      const k = String(e.equipo || "OTROS").toUpperCase();
      map.set(k, (map.get(k) || 0) + 1);
    });
    const parts: string[] = [];
    Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => parts.push(`${v} ${k}`));
    return { total: equipos.length, parts };
  }, [equipos]);

  const exportarEquipos = async () => {
    if (!equipos.length) {
      toast.error("No hay equipos para exportar");
      return;
    }
    const ok = window.confirm(`Se exporta LISTA ${equipos.length} series. ¿Confirmar?`);
    if (!ok) return;
    const data = equipos.map(mapExportRow);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipos");
    XLSX.writeFile(wb, exportFilename("LISTA"));
    toast.success(`Equipos exportados: ${equipos.length}`);
  };

  const exportarPriTec = async () => {
    if (!equipos.length) {
      toast.error("No hay equipos para exportar");
      return;
    }
    const ok = window.confirm(`Se exporta PRI-TEC ${equipos.length} series. ¿Confirmar?`);
    if (!ok) return;
    const data = equipos.map((e) => ({ ...mapExportRow(e), "Pri-Tec": "SI" }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PRI-TEC");
    XLSX.writeFile(wb, exportFilename("PRI-TEC"));
    try {
      await Promise.all(
        equipos.map((e: any) =>
          moverEquipoManualAction({
            sn: String(e.SN || e.id || "").toUpperCase(),
            toUbicacion: String(e.ubicacion || ""),
            caso: String(e.caso || ""),
            observacion: String(e.observacion || ""),
            pri_tec: "SI",
          })
        )
      );
    } catch {}
    setEquipos((prev) => prev.map((e: any) => ({ ...e, pri_tec: "SI" })));
    toast.success(`PRI-TEC exportado y actualizado: ${equipos.length}`);
  };

  const exportarTecLiq = async () => {
    if (!equipos.length) {
      toast.error("No hay equipos para exportar");
      return;
    }
    const ok = window.confirm(`Se exporta TEC-LIQ ${equipos.length} series. ¿Confirmar?`);
    if (!ok) return;
    const data = equipos.map((e) => ({ ...mapExportRow(e), "Tec-Liq": "SI" }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TEC-LIQ");
    XLSX.writeFile(wb, exportFilename("TEC-LIQ"));
    try {
      await Promise.all(
        equipos.map((e: any) =>
          moverEquipoManualAction({
            sn: String(e.SN || e.id || "").toUpperCase(),
            toUbicacion: String(e.ubicacion || ""),
            caso: String(e.caso || ""),
            observacion: String(e.observacion || ""),
            tec_liq: "SI",
          })
        )
      );
    } catch {}
    setEquipos((prev) => prev.map((e: any) => ({ ...e, tec_liq: "SI" })));
    toast.success(`TEC-LIQ exportado y actualizado: ${equipos.length}`);
  };

  useEffect(() => {
    const id = setTimeout(() => {
      setSnFilter(snQuery.trim().toUpperCase());
    }, 250);
    return () => clearTimeout(id);
  }, [snQuery]);

  useEffect(() => {
    setExactSearch(false);
  }, [snQuery]);

  const cuadrillaByNombre = useMemo(() => {
    const m = new Map<string, string>();
    cuadrillas.forEach((c) => {
      const key = String(c.nombre || "").toUpperCase();
      if (key) m.set(key, c.id);
    });
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
    return normalizeList(base);
  }, [cuadrillas]);

  const estadosDisponibles = useMemo(
    () => normalizeList(["ALMACEN", "CAMPO", "INSTALADO", "WIN", "DESCONTADOS"]),
    []
  );

  const equiposDisponibles = useMemo(() => normalizeList((equipos || []).map((e) => e.equipo || "")), [equipos]);

  const selectedDescsKey = useMemo(
    () => Array.from(selectedDescs).sort().join("|"),
    [selectedDescs]
  );

  const descripcionesFiltradas = useMemo(() => descOptions, [descOptions]);

  async function fetchList(reset = false, exactOverride?: boolean, snOverride?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (!reset && cursor) params.set("cursor", cursor);
      const snVal = (snOverride ?? snFilter).trim();
      if (snVal) {
        params.set("sn", snVal);
        if (typeof exactOverride === "boolean" ? exactOverride : exactSearch) params.set("exact", "1");
      }
      if (filtroEstados.size > 0) {
        Array.from(filtroEstados).forEach((e) => params.append("estado", e));
      }
      if (filtroUbicacion) params.set("ubicacion", filtroUbicacion);
      if (filtroEquipo) params.set("equipo", filtroEquipo);
      if (filtroPriTec) params.set("pri_tec", filtroPriTec);
      if (filtroTecLiq) params.set("tec_liq", filtroTecLiq);
      if (filtroInv) params.set("inv", filtroInv);
      if (selectedDescs.size > 0) {
        Array.from(selectedDescs).forEach((d) => params.append("descripcion", d));
      }

      const res = await fetch(`/api/equipos/list?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("LIST_FAIL");
      const data = (await res.json()) as ListResponse;
      if (!data?.ok) throw new Error("LIST_FAIL");
      if (data.cuadrillas) setCuadrillas(data.cuadrillas);
      setHasMore(!!data.hasMore);
      setCursor(data.nextCursor || null);
      setEquipos((prev) => (reset ? data.items : [...prev, ...data.items]));
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo cargar"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchDescOptions() {
    try {
      const params = new URLSearchParams();
      if (filtroEstados.size > 0) {
        Array.from(filtroEstados).forEach((e) => params.append("estado", e));
      }
      if (filtroEquipo) params.set("equipo", filtroEquipo);
      if (filtroUbicacion) params.set("ubicacion", filtroUbicacion);
      const res = await fetch(`/api/equipos/descripciones?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.items)) setDescOptions(data.items);
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    setEquipos([]);
    setCursor(null);
    fetchList(true);
    fetchDescOptions();
  }, [snFilter, filtroUbicacion, filtroEquipo, filtroPriTec, filtroTecLiq, filtroInv, selectedDescsKey, filtroEstados.size]);

  useEffect(() => {
    fetchDescOptions();
    setSelectedDescs(new Set());
  }, [filtroEquipo, filtroUbicacion, filtroEstados.size]);

  const startEdit = (row: EquipoRow) => {
    setEditingId(row.id);
    setNextUbicacion(String(row.ubicacion || ""));
    setEditCaso(String((row as any).caso || ""));
    setEditObs(String((row as any).observacion || ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNextUbicacion("");
    setEditCaso("");
    setEditObs("");
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
          caso: editCaso,
          observacion: editObs,
        });
        if (!r?.ok) throw new Error("MOVE_FAIL");
        cancelEdit();
        setEquipos([]);
        setCursor(null);
        await fetchList(true);
        toast.success("Equipo actualizado");
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
    setSnQuery("");
    setSnFilter("");
    setFiltroEstados(new Set());
    setFiltroUbicacion("");
    setFiltroEquipo("");
    setFiltroPriTec("");
    setFiltroTecLiq("");
    setFiltroInv("");
    setSelectedDescs(new Set());
  };

  return (
    <div className="space-y-3">
      <div className="rounded border px-3 py-2 text-sm">
        <div className="font-medium">Resumen</div>
        <div>Total: {resumenByEquipo.total}</div>
        <div className="text-muted-foreground">{resumenByEquipo.parts.join(" - ") || "-"}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={snQuery}
          onChange={(e) => setSnQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setEquipos([]);
              setCursor(null);
              const exact = snQuery.trim().toUpperCase();
              if (exact) {
                const isTail = exact.length === 6;
                setExactSearch(!isTail);
                fetchList(true, !isTail, exact);
              }
            }
          }}
          className="w-full max-w-xs rounded border px-3 py-2 text-sm font-mono"
          placeholder="Buscar SN (prefijo; Enter = exacto)"
        />

        <div className="rounded border px-2 py-2 text-xs" data-dd="estado">
          <div className="font-medium mb-1">Estado</div>
          <div className="relative">
            <button
              type="button"
              className="min-w-[160px] rounded border px-2 py-1 text-left text-xs"
              onClick={() => setEstadoOpen((v) => !v)}
            >
              {filtroEstados.size > 0 ? `Seleccionados: ${filtroEstados.size}` : "Seleccionar estados"}
            </button>
            {estadoOpen && (
              <div className="absolute z-20 mt-1 w-48 rounded border bg-white p-2 shadow">
                {estadosDisponibles.map((estado) => (
                  <label key={estado} className="flex items-center gap-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={filtroEstados.has(estado)}
                      onChange={(e) => {
                        setFiltroEstados((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(estado);
                          else next.delete(estado);
                          return next;
                        });
                      }}
                    />
                    <span>{estado}</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-2 py-1 text-xs"
                  onClick={() => setEstadoOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>

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
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">Equipo</option>
          {equiposDisponibles.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportarEquipos}
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
        >
          Exportar Equipos
        </button>
        <button
          type="button"
          onClick={exportarPriTec}
          className="rounded bg-purple-600 px-3 py-2 text-sm text-white"
        >
          Exportar PRI-TEC
        </button>
        <button
          type="button"
          onClick={exportarTecLiq}
          className="rounded bg-green-600 px-3 py-2 text-sm text-white"
        >
          Exportar TEC-LIQ
        </button>
      </div>

        <div className="rounded border p-3" data-dd="desc">
        <div className="text-sm font-medium">Descripcion</div>
        <div className="mt-2 flex gap-2">
          <div className="relative">
            <button
              type="button"
              className="min-w-[220px] rounded border px-2 py-1 text-left text-xs"
              onClick={() => setDescOpen((v) => !v)}
            >
              {selectedDescs.size > 0 ? `Seleccionadas: ${selectedDescs.size}` : "Seleccionar descripciones"}
            </button>
            {descOpen && (
              <div className="absolute z-20 mt-1 w-64 rounded border bg-white p-2 shadow max-h-56 overflow-auto">
                {descripcionesFiltradas.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sin descripciones</div>
                ) : (
                  descripcionesFiltradas.map((d) => (
                    <label key={d} className="flex items-center gap-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedDescs.has(d)}
                        onChange={(e) => toggleDesc(d, e.target.checked)}
                      />
                      <span>{d}</span>
                    </label>
                  ))
                )}
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-2 py-1 text-xs"
                  onClick={() => setDescOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setSelectedDescs(new Set())}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="rounded border overflow-auto">
        <table className="min-w-[1100px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">SN</th>
              <th className="p-2">F. Despacho</th>
              <th className="p-2">Tecnicos</th>
              <th className="p-2">F. Instalacion</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">F. Ingreso</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Ubicacion</th>
              <th className="p-2">Equipo</th>
              <th className="p-2">Caso</th>
              <th className="p-2">Observacion</th>
              <th className="p-2">PRI-TEC</th>
              <th className="p-2">TEC-LIQ</th>
              <th className="p-2">INV</th>
              <th className="p-2">Accion</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e: any) => {
              const isEditing = editingId === e.id;
              return (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-mono">{e.SN || e.id}</td>
                  <td className="p-2">{e.f_despachoYmd || "-"}</td>
                  <td className="p-2">
                    {Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : e.tecnicos || "-"}
                  </td>
                  <td className="p-2">{e.f_instaladoYmd || "-"}</td>
                  <td className="p-2">{e.cliente || "-"}</td>
                  <td className="p-2">{e.f_ingresoYmd || "-"}</td>
                  <td className="p-2">{e.estado || "-"}</td>
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
                  <td className="p-2">{e.equipo || "-"}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <input
                        value={editCaso}
                        onChange={(ev) => setEditCaso(ev.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    ) : (
                      e.caso || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input
                        value={editObs}
                        onChange={(ev) => setEditObs(ev.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    ) : (
                      e.observacion || "-"
                    )}
                  </td>
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
                              Editar
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
            {equipos.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>{loading ? "Cargando..." : `${equipos.length} registros`}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:opacity-50"
            onClick={() => fetchList(false)}
            disabled={!hasMore || loading}
          >
            Ver mas
          </button>
        </div>
      </div>
    </div>
  );
}
