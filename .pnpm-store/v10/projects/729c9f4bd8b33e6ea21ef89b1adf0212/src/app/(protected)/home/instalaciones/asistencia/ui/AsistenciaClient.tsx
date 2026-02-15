"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import Select from "react-select";
import { toast } from "sonner";

dayjs.extend(customParseFormat);
dayjs.locale("es");

type AsistenciaRow = {
  id: string;
  nombre: string;
  zonaId?: string;
  zonaNombre?: string;
  tipoZona?: string;
  gestorUid?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
  tecnicosUids?: string[];
  estadoAsistencia?: string;
  tecnicosIds?: string[];
  observacion?: string;
};

type GestorDraft = {
  id: string;
  gestorUid: string;
  estado: string;
  confirmadoAt?: any;
  cerradoAt?: any;
};

type Option = { value: string; label: string };

const estados = [
  "asistencia",
  "falta",
  "suspendida",
  "descanso",
  "descanso medico",
  "vacaciones",
  "recuperacion",
  "asistencia compensada",
];

const estadoColor = (e: string) => {
  switch ((e || "").toLowerCase()) {
    case "asistencia": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "falta": return "text-rose-700 bg-rose-50 border-rose-200";
    case "suspendida": return "text-orange-700 bg-orange-50 border-orange-200";
    case "descanso": return "text-amber-700 bg-amber-50 border-amber-200";
    case "descanso medico": return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "vacaciones": return "text-blue-700 bg-blue-50 border-blue-200";
    case "recuperacion": return "text-slate-700 bg-slate-50 border-slate-200";
    case "asistencia compensada": return "text-blue-700 bg-blue-50 border-blue-200";
    default: return "text-slate-700 bg-slate-50 border-slate-200";
  }
};

export default function AsistenciaClient() {
  const [fecha, setFecha] = useState(dayjs().format("YYYY-MM-DD"));
  const [rows, setRows] = useState<AsistenciaRow[]>([]);
  const [gestores, setGestores] = useState<Option[]>([]);
  const [drafts, setDrafts] = useState<GestorDraft[]>([]);
  const [gestorUid, setGestorUid] = useState("");
  const [draftEstado, setDraftEstado] = useState("ABIERTO");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modoAdmin, setModoAdmin] = useState(false);
  const [assignedAll, setAssignedAll] = useState<string[]>([]);

  const [tecnicos, setTecnicos] = useState<Option[]>([]);

  const cargarTecnicos = async () => {
    const res = await fetch("/api/usuarios/by-role?role=TECNICO", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    setTecnicos((data.items || []).map((u: any) => ({ value: u.uid, label: u.label })));
  };

  const cargarGestores = async () => {
    const res = await fetch("/api/usuarios/by-role?role=GESTOR", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    setGestores((data.items || []).map((u: any) => ({ value: u.uid, label: u.label })));
  };

  const cargarDrafts = async () => {
    const res = await fetch(`/api/asistencia/borradores/list?fecha=${encodeURIComponent(fecha)}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data?.ok) {
      setModoAdmin(true);
      setDrafts(data.items || []);
    } else {
      setModoAdmin(false);
      setDrafts([]);
    }
  };

  const cargar = async (uid?: string) => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ fecha });
      if (uid) params.set("gestorUid", uid);
      const res = await fetch(`/api/asistencia/cuadrillas?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      setRows(data.rows || []);
      setAssignedAll(data.assignedTecnicosAll || []);
      setGestorUid(data.gestorUid || uid || "");
      setDraftEstado(data.draftEstado || "ABIERTO");
    } catch (e: any) {
      toast.error(e?.message || "Error cargando asistencia");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([cargarTecnicos(), cargarGestores()]);
      } catch (e: any) {
        toast.error(e?.message || "Error cargando catálogos");
      }
    })();
  }, []);

  useEffect(() => {
    cargarDrafts();
    cargar();
  }, [fecha]);

  const draftsMap = useMemo(() => {
    const map = new Map<string, GestorDraft>();
    drafts.forEach((d) => map.set(d.gestorUid, d));
    return map;
  }, [drafts]);

  const filtered = useMemo(() => {
    const q = filtroNombre.toLowerCase().trim();
    return rows.filter((r) => {
      const okQ = q ? String(r.nombre || "").toLowerCase().includes(q) : true;
      return okQ;
    });
  }, [rows, filtroNombre]);

  const updateRow = (id: string, patch: Partial<AsistenciaRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const assignedAllSet = useMemo(() => new Set(assignedAll.map((t) => String(t || "").trim())), [assignedAll]);
  const allowedFromGestorSet = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      (r.tecnicosUids || []).forEach((t) => set.add(String(t || "").trim()));
    });
    return set;
  }, [rows]);

  const guardarBorrador = async () => {
    if (draftEstado !== "ABIERTO") {
      toast.error("El borrador está cerrado o confirmado");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fecha,
        gestorUid,
        cuadrillas: rows.map((r) => ({
          cuadrillaId: r.id,
          cuadrillaNombre: r.nombre,
          zonaId: r.zonaId || "",
          zonaNombre: r.zonaNombre || "",
          estadoAsistencia: r.estadoAsistencia || "asistencia",
          tecnicosIds: r.tecnicosIds || [],
          observacion: r.observacion || "",
          coordinadorUid: r.coordinadorUid || "",
          coordinadorNombre: r.coordinadorNombre || "",
        })),
      };
      const res = await fetch("/api/asistencia/borradores/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Borrador guardado");
      await cargar(gestorUid);
      await cargarDrafts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const confirmar = async () => {
    if (draftEstado === "CERRADO") return;
    setSaving(true);
    try {
      const res = await fetch("/api/asistencia/borradores/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, gestorUid }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Asistencia confirmada");
      await cargar(gestorUid);
      await cargarDrafts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo confirmar");
    } finally {
      setSaving(false);
    }
  };

  const cerrar = async (uid?: string, forzar?: boolean) => {
    setClosing(true);
    try {
      const res = await fetch("/api/asistencia/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, gestorUid: uid, forzar: !!forzar }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Asistencia cerrada");
      await cargar(uid || gestorUid);
      await cargarDrafts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cerrar");
    } finally {
      setClosing(false);
    }
  };

  const resumen = useMemo(() => {
    const acc: Record<string, number> = {};
    filtered.forEach((r) => {
      const e = String(r.estadoAsistencia || "asistencia").toLowerCase();
      acc[e] = (acc[e] || 0) + 1;
    });
    return acc;
  }, [filtered]);

  const disabled = modoAdmin ? draftEstado === "CERRADO" : draftEstado !== "ABIERTO";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar cuadrilla..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={() => cargar(gestorUid)}
              className="px-3 py-2 rounded bg-slate-800 text-white text-sm"
            >
              Recargar
            </button>
          </div>
        </div>

        {modoAdmin && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Select
              options={gestores}
              value={gestores.find((g) => g.value === gestorUid) || null}
              onChange={(sel) => {
                const uid = sel?.value || "";
                setGestorUid(uid);
                if (uid) cargar(uid);
              }}
              placeholder="Seleccionar gestora"
            />
            <div className="px-3 py-2 rounded border text-sm flex items-center justify-between">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium">
                {draftsMap.get(gestorUid)?.estado || "ABIERTO"}
              </span>
            </div>
            <button
              onClick={() => cerrar(gestorUid, true)}
              className="px-3 py-2 rounded bg-rose-600 text-white text-sm"
              disabled={closing}
            >
              Cerrar por gestora
            </button>
            <button
              onClick={() => {
                const abiertos = drafts.filter((d) => d.estado === "ABIERTO");
                if (abiertos.length > 0) {
                  const ok = window.confirm(
                    `Hay ${abiertos.length} borrador(es) ABIERTO. ¿Deseas cerrar todo el día de todas formas?`
                  );
                  if (!ok) return;
                }
                cerrar(undefined, true);
              }}
              className="px-3 py-2 rounded bg-amber-600 text-white text-sm"
              disabled={closing}
            >
              Cerrar todo el día
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(resumen).map(([k, v]) => (
          <span key={k} className={`px-2 py-1 text-xs rounded border ${estadoColor(k)}`}>
            {k}: {v}
          </span>
        ))}
        <span className={`px-2 py-1 text-xs rounded border ${draftEstado === "ABIERTO" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
          Borrador: {draftEstado}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-gray-700">
            <tr>
              <th className="p-2 text-left">Cuadrilla</th>
              <th className="p-2 text-left">Zona</th>
              <th className="p-2 text-left">Técnicos</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Observación</th>
              <th className="p-2 text-left">Coordinador</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!cargando && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  No hay cuadrillas para mostrar.
                </td>
              </tr>
            )}
            {!cargando &&
              filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.nombre}</td>
                  <td className="p-2">{r.zonaNombre || r.zonaId || "-"}</td>
                  <td className="p-2 min-w-[260px]">
                    <Select
                      isMulti
                      options={tecnicos.filter((t) => {
                        const inCurrent = (r.tecnicosIds || []).includes(t.value);
                        const inOriginal = (r.tecnicosUids || []).includes(t.value);
                        const assignedElsewhere = assignedAllSet.has(t.value);
                        return inCurrent || inOriginal || !assignedElsewhere;
                      })}
                      value={tecnicos.filter((t) => (r.tecnicosIds || []).includes(t.value))}
                      onChange={(sel) => updateRow(r.id, { tecnicosIds: (sel || []).map((s) => s.value) })}
                      isDisabled={disabled}
                      placeholder="Seleccionar técnicos"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      value={r.estadoAsistencia || "asistencia"}
                      onChange={(e) => updateRow(r.id, { estadoAsistencia: e.target.value })}
                      disabled={disabled}
                      className="border rounded px-2 py-1"
                    >
                      {estados.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      value={r.observacion || ""}
                      onChange={(e) => updateRow(r.id, { observacion: e.target.value })}
                      disabled={disabled}
                      className="border rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td className="p-2">{r.coordinadorNombre || r.coordinadorUid || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={guardarBorrador}
          disabled={saving || disabled}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar borrador"}
        </button>
        <button
          onClick={confirmar}
          disabled={saving || draftEstado !== "ABIERTO"}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          Marcar conforme
        </button>
      </div>
    </div>
  );
}
