"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import Select from "react-select";
import { toast } from "sonner";

dayjs.extend(customParseFormat);
dayjs.locale("es");

type Opt = { value: string; label: string };

type AssignMap = Record<string, string[]>;

type ApiResponse = {
  ok: boolean;
  fecha: string;
  gestores: Opt[];
  cuadrillas: Opt[];
  base: AssignMap;
  day: AssignMap;
  topBase: string[];
  topDay: string[] | null;
};

const cls = (...x: (string | false | null | undefined)[]) => x.filter(Boolean).join(" ");

const uniq = (arr: string[]) => Array.from(new Set((arr || []).filter(Boolean)));

const sortCuads = (list: Opt[]) =>
  [...list].sort((a, b) => String(a.label).localeCompare(String(b.label), "es", { sensitivity: "base" }));

function normalizeMap(map: AssignMap): AssignMap {
  const out: AssignMap = {};
  Object.entries(map || {}).forEach(([k, v]) => {
    out[k] = uniq(v || []).sort();
  });
  return out;
}

function findDuplicates(map: AssignMap) {
  const used = new Map<string, string[]>();
  Object.entries(map || {}).forEach(([gestor, cuadIds]) => {
    (cuadIds || []).forEach((cid) => {
      const key = String(cid || "").trim();
      if (!key) return;
      const arr = used.get(key) || [];
      arr.push(gestor);
      used.set(key, arr);
    });
  });
  const dup: Record<string, string[]> = {};
  used.forEach((gestores, cid) => {
    if (gestores.length > 1) dup[cid] = gestores;
  });
  return dup;
}

function diffSets(a: string[], b: string[]) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  let add = 0;
  let rem = 0;
  B.forEach((x) => { if (!A.has(x)) add++; });
  A.forEach((x) => { if (!B.has(x)) rem++; });
  return { add, rem, total: add + rem };
}

export default function AsignacionGestoresClient() {
  const [fecha, setFecha] = useState(dayjs().format("YYYY-MM-DD"));
  const [gestores, setGestores] = useState<Opt[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Opt[]>([]);
  const [baseMap, setBaseMap] = useState<AssignMap>({});
  const [dayMap, setDayMap] = useState<AssignMap>({});
  const [topBase, setTopBase] = useState<string[]>([]);
  const [topDay, setTopDay] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"base" | "dia">("dia");
  const [filtroGestor, setFiltroGestor] = useState("");
  const [soloCambios, setSoloCambios] = useState(false);
  const [programState, setProgramState] = useState<Record<string, string>>({});
  const [modalGestor, setModalGestor] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);

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

  const cargar = async (ymd: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/instalaciones/asignacion-gestores?fecha=${encodeURIComponent(ymd)}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      setGestores(data.gestores || []);
      setCuadrillas(sortCuads(data.cuadrillas || []));
      setBaseMap(normalizeMap(data.base || {}));
      setDayMap(normalizeMap(data.day || {}));
      setTopBase(Array.isArray(data.topBase) ? data.topBase : []);
      setTopDay(Array.isArray(data.topDay) ? data.topDay : null);
      const ps = await fetch(`/api/instalaciones/asistencia-programada/estado?fecha=${encodeURIComponent(ymd)}`, { cache: "no-store" });
      const psData = await ps.json();
      if (ps.ok && psData?.ok) setProgramState(psData.map || {});
      else setProgramState({});
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la asignacion");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(fecha);
  }, [fecha]);

  useEffect(() => {
    setBulkSelected([]);
  }, [fecha, tab]);

  const hasDay = Object.keys(dayMap).length > 0;
  const currentMap = tab === "base" ? baseMap : (hasDay ? dayMap : baseMap);
  const currentTop = tab === "base" ? topBase : (topDay ?? topBase);

  const dup = useMemo(() => findDuplicates(currentMap), [currentMap]);
  const dupCount = Object.keys(dup).length;

  const allCuadIds = useMemo(() => new Set(cuadrillas.map((c) => c.value)), [cuadrillas]);
  const assignedSet = useMemo(() => {
    const s = new Set<string>();
    Object.values(currentMap).forEach((arr) => (arr || []).forEach((id) => s.add(id)));
    return s;
  }, [currentMap]);
  const unassignedCount = useMemo(() => {
    let count = 0;
    allCuadIds.forEach((id) => { if (!assignedSet.has(id)) count++; });
    return count;
  }, [allCuadIds, assignedSet]);

  const gestoresVisible = useMemo(() => {
    let list = gestores;
    if (filtroGestor) {
      const q = filtroGestor.toLowerCase();
      list = list.filter((g) => g.label.toLowerCase().includes(q));
    }
    if (tab === "dia" && soloCambios) {
      list = list.filter((g) => diffSets(baseMap[g.value] || [], currentMap[g.value] || []).total > 0);
    }
    if (tab === "dia") {
      list = [...list].sort((a, b) => {
        const aCount = (currentMap[a.value] || []).length;
        const bCount = (currentMap[b.value] || []).length;
        if (aCount === 0 && bCount > 0) return 1;
        if (aCount > 0 && bCount === 0) return -1;
        return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
      });
    }
    return list;
  }, [gestores, filtroGestor, tab, soloCambios, baseMap, currentMap]);

  const maxListLen = useMemo(() => {
    const lens = gestoresVisible.map((g) => (currentMap[g.value] || []).length);
    return lens.length ? Math.max(...lens) : 0;
  }, [gestoresVisible, currentMap]);

  const cardMinH = useMemo(() => {
    const base = 220;
    const per = 20;
    return base + maxListLen * per;
  }, [maxListLen]);

  const asignadosPorGestor = (uid: string) => currentMap[uid] || [];

  const setAsignacion = (uid: string, value: string[]) => {
    const next = { ...currentMap, [uid]: uniq(value) };
    if (tab === "base") setBaseMap(next);
    else setDayMap(next);
  };

  const usarBaseParaDia = () => {
    setDayMap(JSON.parse(JSON.stringify(baseMap)));
    setTopDay([...topBase]);
    toast.success("Base aplicada para este dia");
  };

  const limpiarGestoresDia = () => {
    const next: AssignMap = {};
    gestores.forEach((g) => {
      next[g.value] = [];
    });
    setDayMap(next);
    toast.success("Se limpiaron las asignaciones diarias de todos los gestores");
  };

  const guardar = async () => {
    if (dupCount > 0) {
      toast.error("Hay cuadrillas asignadas a mas de una gestora");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tipo: tab,
        fecha,
        gestoresMap: currentMap,
        topGestores: currentTop,
      };
      const res = await fetch("/api/instalaciones/asignacion-gestores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success(tab === "base" ? "Base guardada" : "Asignacion diaria guardada");
      await cargar(fecha);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const resumen = useMemo(() => {
    const totalGestores = gestores.length;
    const totalCuadrillas = cuadrillas.length;
    const totalAsignadas = assignedSet.size;
    const totalTop = currentTop.length;
    const cambiosTotales = gestores.reduce((acc, g) => acc + diffSets(baseMap[g.value] || [], currentMap[g.value] || []).total, 0);
    return { totalGestores, totalCuadrillas, totalAsignadas, totalTop, cambiosTotales };
  }, [gestores, cuadrillas, assignedSet, currentTop, baseMap, currentMap]);

  const gestorLabel = (uid: string) => gestores.find((g) => g.value === uid)?.label || uid;

  const visibleCuadrillas = useMemo(() => {
    if (tab !== "dia") return cuadrillas;
    if (!programState || Object.keys(programState).length === 0) return cuadrillas;
    return cuadrillas.filter((c) => {
      const v = String(programState?.[c.value] || "descanso").toLowerCase();
      return v === "asistencia";
    });
  }, [cuadrillas, tab, programState]);
  const isTopGestor = (uid: string) => currentTop.includes(uid);
  const cuadrillasActivasCount = visibleCuadrillas.length;
  const cuadrillasBloqueadasCount = Math.max(0, cuadrillas.length - visibleCuadrillas.length);

  const selectStyles = useMemo(
    () =>
      isDark
        ? {
            control: (base: any, state: any) => ({
              ...base,
              backgroundColor: "#020617",
              borderColor: state.isFocused ? "#38bdf8" : "#334155",
              boxShadow: "none",
              ":hover": { borderColor: "#475569" },
            }),
            menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
            option: (base: any, state: any) => ({
              ...base,
              backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
              color: "#e2e8f0",
            }),
            singleValue: (base: any) => ({ ...base, color: "#e2e8f0" }),
            input: (base: any) => ({ ...base, color: "#e2e8f0" }),
            placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
            multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
            multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
            multiValueRemove: (base: any) => ({ ...base, color: "#cbd5e1" }),
          }
        : undefined,
    [isDark]
  );

  const listNames = (ids: string[]) => ids
    .map((id) => cuadrillas.find((c) => c.value === id)?.label || id)
    .sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));

  const copyResumenGestor = async (uid: string) => {
    const nombre = gestorLabel(uid);
    const lista = listNames(asignadosPorGestor(uid));
    const header = `${nombre}\n`;
    const body = lista.map((x) => `- ${x}`).join("\n");
    const text = `${header}${body}`;
    await navigator.clipboard.writeText(text);
    toast.success("Resumen copiado");
  };

  const renderCardList = (uid: string) => {
    const lista = listNames(asignadosPorGestor(uid));
    if (!lista.length) return <div className="text-xs text-slate-500 dark:text-slate-400">Sin cuadrillas</div>;

    return (
      <div className="space-y-0.5 text-xs text-slate-700 dark:text-slate-200">
        {lista.map((x) => (
          <div key={x} className="truncate">- {x}</div>
        ))}
      </div>
    );
  };

  const availableFor = (uid: string) => {
    const selected = asignadosPorGestor(uid);
    return visibleCuadrillas.filter((c) => !assignedSet.has(c.value) || selected.includes(c.value));
  };

  const bulkSourceIds = useMemo(() => {
    if (!bulkFrom) return [];
    const selected = asignadosPorGestor(bulkFrom);
    if (tab !== "dia") return selected;
    const visibleSet = new Set(visibleCuadrillas.map((c) => c.value));
    return selected.filter((id) => visibleSet.has(id));
  }, [bulkFrom, tab, visibleCuadrillas, currentMap]);

  const bulkSourceOptions = useMemo(() => {
    return bulkSourceIds
      .map((id) => ({
        value: id,
        label: cuadrillas.find((c) => c.value === id)?.label || id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [bulkSourceIds, cuadrillas]);

  const applyBulkMove = (ids: string[], opts?: { replaceTarget?: boolean }) => {
    const sourceUid = String(bulkFrom || "").trim();
    const targetUid = String(bulkTo || "").trim();
    const moveIds = uniq(ids);

    if (!sourceUid) return toast.error("Selecciona gestora origen");
    if (!targetUid) return toast.error("Selecciona gestora destino");
    if (sourceUid === targetUid) return toast.error("La gestora destino debe ser distinta");
    if (!moveIds.length) return toast.error("No hay cuadrillas para mover");

    const sourceCurrent = asignadosPorGestor(sourceUid);
    const targetCurrent = asignadosPorGestor(targetUid);
    const moveSet = new Set(moveIds);

    const nextMap: AssignMap = { ...currentMap };
    nextMap[sourceUid] = sourceCurrent.filter((id) => !moveSet.has(id));
    nextMap[targetUid] = opts?.replaceTarget ? uniq(moveIds) : uniq([...targetCurrent, ...moveIds]);

    if (tab === "base") setBaseMap(nextMap);
    else setDayMap(nextMap);

    setBulkSelected([]);
    toast.success(
      opts?.replaceTarget
        ? `${moveIds.length} cuadrilla(s) asignadas reemplazando destino`
        : `${moveIds.length} cuadrilla(s) movidas a ${gestorLabel(targetUid)}`
    );
  };

  const toggleBulkSelected = (cuadrillaId: string) => {
    setBulkSelected((prev) =>
      prev.includes(cuadrillaId) ? prev.filter((id) => id !== cuadrillaId) : [...prev, cuadrillaId]
    );
  };

  const allBulkSelected = bulkSourceIds.length > 0 && bulkSelected.length === bulkSourceIds.length;

  const toggleBulkSelectAll = () => {
    setBulkSelected(allBulkSelected ? [] : bulkSourceIds);
  };


  const printResumenDiario = () => {
    const ymd = dayjs(fecha, "YYYY-MM-DD").format("DD/MM/YYYY");
    const rows = gestores
      .map((g) => ({
        nombre: g.label,
        lista: listNames(asignadosPorGestor(g.value)),
      }))
      .filter((r) => r.lista.length > 0);

    const html = `
      <html>
      <head>
        <title>Resumen asignacion ${ymd}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .name { font-weight: 700; margin-bottom: 6px; }
          ul { margin: 0; padding-left: 18px; }
          li { margin: 2px 0; }
        </style>
      </head>
      <body>
        <h1>Resumen asignacion de gestores</h1>
        <div class="meta">Fecha: ${ymd}</div>
        ${rows.map(r => `
          <div class="card">
            <div class="name">${r.nombre}</div>
            <ul>${r.lista.map(c => `<li>${c}</li>`).join()}</ul>
          </div>`).join()}
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-4 p-4 text-slate-900 dark:text-slate-100">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="bg-[linear-gradient(135deg,#15386b_0%,#30518c_58%,#e7efff_58%,#f8fbff_100%)] px-5 py-5 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#1e293b_58%,#334155_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="text-white">
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                Operacion diaria
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Asignacion de gestores</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-50/90">
                Base permanente y programacion por dia con mejor lectura para cuadrillas activas, cambios y pendientes.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 text-white">
                <label className="text-sm font-medium text-blue-50/90">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none"
                />
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-blue-50/90">
                  {dayjs(fecha, "YYYY-MM-DD").format("DD/MM/YYYY")}
                </span>
                <button
                  className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                  onClick={() => setFecha(dayjs().format("YYYY-MM-DD"))}
                >
                  Hoy
                </button>
                <button
                  className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                  onClick={() => setFecha(dayjs().add(1, "day").format("YYYY-MM-DD"))}
                >
                  Manana
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-5 py-4 md:grid-cols-3 xl:grid-cols-6 dark:border-slate-700">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Gestores</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{resumen.totalGestores}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Cuadrillas</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{resumen.totalCuadrillas}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Asignadas</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{resumen.totalAsignadas}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Sin asignar</div>
            <div className={cls("mt-1 text-2xl font-semibold", unassignedCount > 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100")}>
              {unassignedCount}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Activas</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{cuadrillasActivasCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">TOP</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{resumen.totalTop}</div>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1.35fr,1fr]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTab("dia")}
                className={cls(
                  "rounded-full px-4 py-2 text-sm font-medium ring-1 transition",
                  tab === "dia"
                    ? "bg-[#30518c] text-white ring-[#30518c]"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                )}
              >
                Programacion diaria
              </button>
              <button
                onClick={() => setTab("base")}
                className={cls(
                  "rounded-full px-4 py-2 text-sm font-medium ring-1 transition",
                  tab === "base"
                    ? "bg-[#30518c] text-white ring-[#30518c]"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                )}
              >
                Base permanente
              </button>
              {tab === "dia" && (
                <span
                  className={cls(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    hasDay
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  )}
                >
                  {hasDay ? "Con programacion guardada" : "Usando base como referencia"}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {tab === "dia"
                ? `Solo se pueden elegir cuadrillas activas en asistencia programada. Bloqueadas para esta fecha: ${cuadrillasBloqueadasCount}.`
                : "La base permanente actualiza el gestor principal de cada cuadrilla y sirve como referencia para la programacion diaria."}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {tab === "dia" && (
                <button
                  onClick={usarBaseParaDia}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Usar base para este dia
                </button>
              )}
              {tab === "dia" && (
                <button
                  onClick={limpiarGestoresDia}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70"
                >
                  Limpiar gestores del dia
                </button>
              )}
              {tab === "dia" && (
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={soloCambios}
                    onChange={(e) => setSoloCambios(e.target.checked)}
                  />
                  Solo con cambios
                </label>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Busqueda y guardado</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Filtra por gestor y guarda la configuracion visible cuando termines.
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                placeholder="Buscar gestor..."
                value={filtroGestor}
                onChange={(e) => setFiltroGestor(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                onClick={guardar}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : (tab === "base" ? "Guardar base" : "Guardar por dia")}
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Movimiento masivo</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Mueve todas o solo algunas cuadrillas de una gestora a otra sin editar tarjeta por tarjeta.
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {tab === "dia"
                  ? `En programacion diaria solo se consideran cuadrillas activas para ${dayjs(fecha, "YYYY-MM-DD").format("DD/MM/YYYY")}.`
                  : "En base permanente puedes mover cualquier cuadrilla asignada."}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,1fr,auto]">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Gestora origen</label>
                <select
                  value={bulkFrom}
                  onChange={(e) => {
                    setBulkFrom(e.target.value);
                    setBulkSelected([]);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Selecciona origen...</option>
                  {gestores.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label} ({asignadosPorGestor(g.value).length})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Gestora destino</label>
                <select
                  value={bulkTo}
                  onChange={(e) => setBulkTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Selecciona destino...</option>
                  {gestores
                    .filter((g) => g.value !== bulkFrom)
                    .map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label} ({asignadosPorGestor(g.value).length})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyBulkMove(bulkSourceIds)}
                  disabled={!bulkFrom || !bulkTo || !bulkSourceIds.length}
                  className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Mover todas
                </button>
                <button
                  type="button"
                  onClick={() => applyBulkMove(bulkSelected)}
                  disabled={!bulkFrom || !bulkTo || !bulkSelected.length}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Mover seleccionadas
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Cuadrillas de origen: {bulkFrom ? gestorLabel(bulkFrom) : "-"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Disponibles para mover: {bulkSourceIds.length} | Seleccionadas: {bulkSelected.length}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={toggleBulkSelectAll}
                    disabled={!bulkSourceIds.length}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    {allBulkSelected ? "Quitar todas" : "Seleccionar todas"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelected([])}
                    disabled={!bulkSelected.length}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="mt-3 max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                {bulkSourceOptions.length ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {bulkSourceOptions.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{opt.label}</span>
                        <input
                          type="checkbox"
                          checked={bulkSelected.includes(opt.value)}
                          onChange={() => toggleBulkSelected(opt.value)}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    {bulkFrom
                      ? "No hay cuadrillas disponibles para mover con el filtro actual."
                      : "Selecciona una gestora origen para ver sus cuadrillas."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {dupCount > 0 && (
          <div className="mx-5 mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            Hay {dupCount} cuadrilla(s) asignadas a mas de una gestora. Corrige antes de guardar.
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Gestor TOP</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {tab === "dia" ? "Si no defines TOP para el dia, se reutiliza la base." : "Configuracion base de gestores con visibilidad total."}
            </div>
          </div>
          {tab === "dia" && (
            <button
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setTopDay(null)}
            >
              Usar TOP base
            </button>
          )}
        </div>

        <div className="mt-3 max-w-[680px]">
          <Select
            isMulti
            options={gestores}
            value={gestores.filter((g) => currentTop.includes(g.value))}
            onChange={(sel) => {
              const next = (sel || []).map((s) => s.value);
              if (tab === "base") setTopBase(next);
              else setTopDay(next);
            }}
            placeholder="Seleccionar gestor(es) TOP"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            styles={{ ...(selectStyles || {}), menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cargando ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Cargando...
          </div>
        ) : (
          gestoresVisible.map((g) => {
            const selected = asignadosPorGestor(g.value);
            const diff = diffSets(baseMap[g.value] || [], selected);
            return (
              <div
                key={g.value}
                className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                style={{ minHeight: cardMinH }}
              >
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Gestor</div>
                      <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{g.label}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTopGestor(g.value) && (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                          TOP
                        </span>
                      )}
                      {tab === "dia" && diff.total > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          +{diff.add} / -{diff.rem}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Cuadrillas asignadas</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{selected.length}</span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    {renderCardList(g.value)}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setModalGestor(g.value)}
                      className="rounded-xl bg-[#30518c] px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-[#203a66]"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => copyResumenGestor(g.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Copiar resumen
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {gestoresVisible.length === 0 && !cargando && (
        <div className="p-6 text-center text-slate-500 dark:text-slate-400">No hay gestores para mostrar</div>
      )}

      {modalGestor && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalGestor(null)} />
          <div className="absolute left-1/2 top-1/2 w-[92%] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Gestor</div>
                <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{gestorLabel(modalGestor)}</div>
              </div>
              <button onClick={() => setModalGestor(null)} className="px-3 py-1 rounded border text-sm">X</button>
            </div>

            <div className="mt-4">
              <Select
                isMulti
                options={availableFor(modalGestor)}
                value={cuadrillas.filter((c) => asignadosPorGestor(modalGestor).includes(c.value))}
                onChange={(sel) => setAsignacion(modalGestor, (sel || []).map((s) => s.value))}
                placeholder="Asignar cuadrillas"
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                menuPosition="fixed"
                styles={{ ...(selectStyles || {}), menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
              />
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Solo se muestran cuadrillas libres o ya asignadas a esta gestora.
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setModalGestor(null)} className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-200">Cancelar</button>
              <button
                onClick={() => {
                  toast.success("Cambios listos. Recuerda guardar.");
                  setModalGestor(null);
                }}
                className="px-3 py-2 rounded bg-emerald-600 text-white text-sm"
              >
                Guardar y cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
