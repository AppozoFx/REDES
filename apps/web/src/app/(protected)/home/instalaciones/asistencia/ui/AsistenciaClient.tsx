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
  updatedAt?: any;
};

type Option = { value: string; label: string };
type GestoresDiaResponse = {
  ok: boolean;
  base?: Record<string, string[]>;
  day?: Record<string, string[]>;
};

const cls = (...x: (string | false | null | undefined)[]) => x.filter(Boolean).join(" ");

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

const estadoMeta = {
  asistencia: { label: "Asistencia", short: "A" },
  falta: { label: "Falta", short: "F" },
  suspendida: { label: "Suspendida", short: "S" },
  descanso: { label: "Descanso", short: "D" },
  "descanso medico": { label: "Descanso medico", short: "DM" },
  vacaciones: { label: "Vacaciones", short: "V" },
  recuperacion: { label: "Recuperacion", short: "R" },
  "asistencia compensada": { label: "Asistencia compensada", short: "AC" },
} as const;

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

const estadoSelectClass = (e: string) =>
  `${estadoColor(e)} rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition`;

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
  const [filtroEstadoGestor, setFiltroEstadoGestor] = useState<string>("");
  const [assignedAll, setAssignedAll] = useState<string[]>([]);
  const [tecnicos, setTecnicos] = useState<Option[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [gestoresConCuadrillasDia, setGestoresConCuadrillasDia] = useState<string[]>([]);

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

  const cargarGestoresConCuadrillasDia = async () => {
    try {
      const res = await fetch(`/api/instalaciones/asignacion-gestores?fecha=${encodeURIComponent(fecha)}`, { cache: "no-store" });
      const data: GestoresDiaResponse = await res.json();
      if (!res.ok || !data?.ok) {
        setGestoresConCuadrillasDia([]);
        return;
      }
      const source = Object.keys(data.day || {}).length > 0 ? (data.day || {}) : (data.base || {});
      const activos = Object.entries(source)
        .filter(([, cuadrillas]) => Array.isArray(cuadrillas) && cuadrillas.length > 0)
        .map(([uid]) => String(uid || "").trim())
        .filter(Boolean);
      setGestoresConCuadrillasDia(activos);
    } catch {
      setGestoresConCuadrillasDia([]);
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
    cargarGestoresConCuadrillasDia();
  }, [fecha]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(root.classList.contains("dark") || mq.matches);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener?.("change", sync);
    return () => {
      obs.disconnect();
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  const selectStyles = isDark
    ? {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
        control: (base: any, state: any) => ({
          ...base,
          backgroundColor: "#020617",
          borderColor: state.isFocused ? "#38bdf8" : "#334155",
          boxShadow: "none",
        }),
        menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
        option: (base: any, state: any) => ({
          ...base,
          backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
          color: "#e2e8f0",
        }),
        input: (base: any) => ({ ...base, color: "#e2e8f0" }),
        placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
        singleValue: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
        multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValueRemove: (base: any) => ({ ...base, color: "#cbd5e1" }),
      }
    : {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
      };

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed" as const,
    styles: selectStyles,
  };

  const draftsMap = useMemo(() => {
    const map = new Map<string, GestorDraft>();
    drafts.forEach((d) => map.set(d.gestorUid, d));
    return map;
  }, [drafts]);

  const formatTs = (v: any) => {
    if (!v) return "-";
    if (typeof v?.toDate === "function") return dayjs(v.toDate()).format("DD/MM/YYYY HH:mm");
    if (typeof v?.seconds === "number") return dayjs(v.seconds * 1000).format("DD/MM/YYYY HH:mm");
    if (typeof v?._seconds === "number") return dayjs(v._seconds * 1000).format("DD/MM/YYYY HH:mm");
    if (typeof v === "string") return dayjs(v).isValid() ? dayjs(v).format("DD/MM/YYYY HH:mm") : v;
    return "-";
  };

  const gestorCards = useMemo(() => {
    return gestores.map((g) => {
      const d = draftsMap.get(g.value);
      const estado = d ? String(d.estado || "ABIERTO").toUpperCase() : "SIN BORRADOR";
      return {
        gestorUid: g.value,
        nombre: g.label,
        estado,
        updatedAt: d?.updatedAt,
      };
    });
  }, [gestores, draftsMap]);

  const filteredCards = useMemo(() => {
    const activos = new Set(gestoresConCuadrillasDia);
    let list = gestorCards.filter((c) => activos.has(String(c.gestorUid || "").trim()));
    if (filtroEstadoGestor) {
      list = list.filter((c) => c.estado === filtroEstadoGestor);
    }
    return list;
  }, [gestorCards, filtroEstadoGestor, gestoresConCuadrillasDia]);

  const gestorActualLabel = useMemo(
    () => gestores.find((g) => g.value === gestorUid)?.label || gestorUid || "Sin gestor seleccionado",
    [gestores, gestorUid]
  );

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

  const assignedAllSet = useMemo(() => {
    const s = new Set(assignedAll.map((t) => String(t || '').trim()));
    // Remove originales de las filas cargadas y agrega la seleccion actual
    rows.forEach((r) => {
      (r.tecnicosUids || []).forEach((id) => s.delete(String(id || '').trim()));
      (r.tecnicosIds || []).forEach((id) => s.add(String(id || '').trim()));
    });
    return s;
  }, [assignedAll, rows]);

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
      toast.success("Cambios guardados en el borrador");
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
      toast.success("Borrador confirmado y enviado a revision administrativa");
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
      toast.success("Asistencia cerrada correctamente");
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

  const draftStatusMeta = useMemo(() => {
    if (draftEstado === "ABIERTO") {
      return {
        title: "Borrador abierto",
        detail: "Puedes editar estados, tecnicos y observaciones antes de confirmar.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-100",
      };
    }
    if (draftEstado === "CONFIRMADO") {
      return {
        title: "Borrador confirmado",
        detail: "El gestor ya no puede editar. Queda pendiente de cierre administrativo o reapertura.",
        tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-100",
      };
    }
    if (draftEstado === "CERRADO") {
      return {
        title: "Registro cerrado",
        detail: "La asistencia ya fue consolidada y no admite cambios desde esta pantalla.",
        tone: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100",
      };
    }
    if (draftEstado === "SIN_SELECCION") {
      return {
        title: "Selecciona un gestor",
        detail: "Primero elige un gestor para cargar cuadrillas y administrar su borrador.",
        tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-100",
      };
    }
    return {
      title: `Estado: ${draftEstado || "-"}`,
      detail: "Revisa el estado del borrador antes de continuar.",
      tone: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100",
    };
  }, [draftEstado]);

  const adminNeedsGestor = modoAdmin && !gestorUid;
  const disabled = adminNeedsGestor || (modoAdmin ? draftEstado === "CERRADO" : draftEstado !== "ABIERTO");

  const reabrir = async () => {
    if (!gestorUid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/asistencia/borradores/reabrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, gestorUid }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Borrador reabierto");
      await cargar(gestorUid);
      await cargarDrafts();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo reabrir");
    } finally {
      setSaving(false);
    }
  };

  const recargarVista = async () => {
    await Promise.all([cargar(gestorUid || undefined), cargarDrafts()]);
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Asistencia de Cuadrillas</h1>
            <p className="text-xs text-slate-500">Borrador por gestora y cierre por Gerencia/Almacén/RRHH.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar cuadrilla..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              onClick={() => {
                void recargarVista();
              }}
              className="rounded-xl bg-[#30518c] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              Recargar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(resumen).map(([k, v]) => (
              <span key={k} className={`px-2 py-1 text-xs rounded border ${estadoColor(k)}`}>
                {estadoMeta[k as keyof typeof estadoMeta]?.label || k}: {v}
              </span>
            ))}
            <span
              className={`px-2 py-1 text-xs rounded border ${
                draftEstado === "ABIERTO"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              Borrador: {draftEstado}
            </span>
          </div>
        </div>

        {modoAdmin && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="px-3 py-2 rounded border text-sm flex items-center justify-between">
              <span className="text-gray-500">Gestor</span>
              <span className="font-medium">
                {gestorActualLabel}
              </span>
            </div>
            <div className="px-3 py-2 rounded border text-sm flex items-center justify-between">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium">
                {gestorUid ? draftsMap.get(gestorUid)?.estado || "ABIERTO" : "Seleccione un gestor"}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 md:col-span-3">
              <select
                value={gestorUid}
                onChange={(e) => {
                  const next = e.target.value;
                  setGestorUid(next);
                  void cargar(next || undefined);
                }}
                className="px-3 py-2 rounded border text-sm"
              >
                <option value="">Seleccionar gestor</option>
                {gestores.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              <select
                value={filtroEstadoGestor}
                onChange={(e) => setFiltroEstadoGestor(e.target.value)}
                className="px-3 py-2 rounded border text-sm"
              >
                <option value="">Todos los estados</option>
                <option value="SIN BORRADOR">Sin borrador</option>
                <option value="ABIERTO">Abierto</option>
                <option value="CONFIRMADO">Confirmado</option>
                <option value="CERRADO">Cerrado</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-100">
        <div className="font-medium">Flujo recomendado</div>
        <div className="mt-1 text-xs text-sky-800/90 dark:text-sky-100/80">
          1. Revisa la fecha y el gestor. 2. Actualiza estados, tecnicos y observaciones. 3. Guarda cambios. 4. Confirma el borrador cuando quede listo.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Gestor activo</div>
          <div className="mt-1 text-sm font-semibold">{gestorActualLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Cuadrillas visibles</div>
          <div className="mt-1 text-sm font-semibold">{filtered.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Estado del borrador</div>
          <div className="mt-1 text-sm font-semibold">{draftEstado}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Fecha</div>
          <div className="mt-1 text-sm font-semibold">{fecha}</div>
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 text-sm ${draftStatusMeta.tone}`}>
        <div className="font-medium">{draftStatusMeta.title}</div>
        <div className="mt-1 text-xs opacity-90">{draftStatusMeta.detail}</div>
      </div>

      {adminNeedsGestor && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-100">
          Selecciona un gestor para cargar cuadrillas, editar el borrador o ejecutar acciones de cierre por gestor.
        </div>
      )}

      {modoAdmin && gestorUid && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones administrativas</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Usa estas acciones solo para gestionar cierres, reaperturas o revisiones por gestor.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => cerrar(gestorUid, false)}
              className="px-3 py-2 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
              disabled={closing || draftEstado === "CERRADO" || !gestorUid}
            >
              Cerrar por gestor
            </button>
            <button
              onClick={reabrir}
              className="px-3 py-2 rounded border border-blue-300 bg-white text-blue-700 text-sm disabled:opacity-60 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
              disabled={saving || draftEstado !== "CONFIRMADO"}
            >
              Reabrir borrador
            </button>
          </div>
        </div>
      )}

      {modoAdmin && gestorCards.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {filteredCards.map((c) => {
            const color =
              c.estado === "CERRADO"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : c.estado === "CONFIRMADO"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : c.estado === "ABIERTO"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-700";
            return (
              <button
                key={c.gestorUid}
                className={`rounded-xl border p-4 text-left ${color} hover:shadow`}
                onClick={() => {
                  setGestorUid(c.gestorUid);
                  cargar(c.gestorUid);
                }}
              >
                <div className="text-xs text-gray-500">Gestor</div>
                <div className="text-sm font-semibold">{c.nombre}</div>
                <div className="mt-2 text-xs">Estado: {c.estado}</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  Actualizado: {formatTs(c.updatedAt)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
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
                <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!cargando && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  No hay cuadrillas para mostrar.
                </td>
              </tr>
            )}
            {!cargando &&
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                  <td className="p-2">{r.nombre}</td>
                  <td className="p-2">{r.zonaNombre || r.zonaId || "-"}</td>
                  <td className="p-2 min-w-[260px]">
                    <Select
                      isMulti
                      options={tecnicos.filter((t) => {
                        const inCurrent = (r.tecnicosIds || []).includes(t.value);
                        const assignedElsewhere = assignedAllSet.has(t.value) && !inCurrent;
                        return inCurrent || !assignedElsewhere;
                      })}
                      value={tecnicos.filter((t) => (r.tecnicosIds || []).includes(t.value))}
                      onChange={(sel) => updateRow(r.id, { tecnicosIds: (sel || []).map((s) => s.value) })}
                      isDisabled={disabled}
                      placeholder="Seleccionar técnicos"
                      {...selectPortalProps}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      value={r.estadoAsistencia || "asistencia"}
                      onChange={(e) => updateRow(r.id, { estadoAsistencia: e.target.value })}
                      disabled={disabled}
                      className={cls(
                        estadoSelectClass(r.estadoAsistencia || "asistencia"),
                        "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      )}
                    >
                      {estados.map((e) => (
                        <option key={e} value={e}>
                          {estadoMeta[e as keyof typeof estadoMeta]?.label || e}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      value={r.observacion || ""}
                      onChange={(e) => updateRow(r.id, { observacion: e.target.value })}
                      disabled={disabled}
                      className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </td>
                  <td className="p-2">{r.coordinadorNombre || r.coordinadorUid || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Acciones del gestor</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Guarda tus cambios cuantas veces necesites. Cuando todo este correcto, confirma el borrador para enviarlo a revision administrativa.
        </div>
        <div className="mt-3 flex items-center gap-2">
        <button
          onClick={guardarBorrador}
          disabled={saving || disabled}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        <button
          onClick={confirmar}
          disabled={saving || draftEstado !== "ABIERTO"}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          Confirmar borrador
        </button>
        {modoAdmin && (
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
            disabled={closing}
            className="px-4 py-2 rounded bg-amber-600 text-white disabled:opacity-60"
          >
            {closing ? "Cerrando..." : "Cerrar todo el día"}
          </button>
        )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Tipificaciones</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {estados.map((estado) => (
              <span key={estado} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${estadoColor(estado)}`}>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 px-1 text-[10px] shadow-sm dark:bg-slate-950/60">
                  {estadoMeta[estado as keyof typeof estadoMeta]?.short || estado.slice(0, 2).toUpperCase()}
                </span>
                <span>{estadoMeta[estado as keyof typeof estadoMeta]?.label || estado}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
  );
}
