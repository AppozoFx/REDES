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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#30518c] dark:text-sky-300">Asignacion de Gestores</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Base permanente (actualiza cuadrillas.gestorUid) y cambios temporales por dia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {dayjs(fecha, "YYYY-MM-DD").format("DD/MM/YYYY")}
            </span>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
              onClick={() => setFecha(dayjs().format("YYYY-MM-DD"))}
            >
              Hoy
            </button>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
              onClick={() => setFecha(dayjs().add(1, "day").format("YYYY-MM-DD"))}
            >
              Manana
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-xs text-slate-500 dark:text-slate-400">Gestores</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{resumen.totalGestores}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-xs text-slate-500 dark:text-slate-400">Cuadrillas</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{resumen.totalCuadrillas}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-xs text-slate-500 dark:text-slate-400">Asignadas</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{resumen.totalAsignadas}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-xs text-slate-500 dark:text-slate-400">Sin asignar</div>
            <div className={cls("text-lg font-semibold", unassignedCount > 0 ? "text-rose-700" : "text-slate-800")}>
              {unassignedCount}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-xs text-slate-500 dark:text-slate-400">TOP</div>
            <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{resumen.totalTop}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab("dia")}
            className={cls(
              "px-3 py-1.5 rounded-full text-sm ring-1",
              tab === "dia"
                ? "bg-[#30518c] text-white ring-[#30518c]"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
            )}
          >
            Programacion diaria
          </button>
          {tab === "dia" && (
            <span
              className={cls(
                "px-2 py-1 text-xs rounded border",
                hasDay
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
              )}
            >
              {hasDay ? "Con programacion" : "Usando base"}
            </span>
          )}
          <button
            onClick={() => setTab("base")}
            className={cls(
              "px-3 py-1.5 rounded-full text-sm ring-1",
              tab === "base"
                ? "bg-[#30518c] text-white ring-[#30518c]"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
            )}
          >
            Base permanente
          </button>

          {tab === "dia" && (
            <button
              onClick={usarBaseParaDia}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Usar base para este dia
            </button>
          )}

          {tab === "dia" && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={soloCambios}
                onChange={(e) => setSoloCambios(e.target.checked)}
              />
              Solo con cambios
            </label>
          )}

          <div className="ml-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar gestor..."
              value={filtroGestor}
              onChange={(e) => setFiltroGestor(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
                        <button
              onClick={guardar}
              disabled={saving}
              className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
            >
              {saving ? "Guardando..." : (tab === "base" ? "Guardar base" : "Guardar por dia")}
            </button>
          </div>
        </div>

        {dupCount > 0 && (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Hay {dupCount} cuadrilla(s) asignadas a mas de una gestora. Corrige antes de guardar.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Gestor TOP (ve todas las cuadrillas)</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {tab === "dia" ? "Si no defines, se usa la base." : "Configuracion base"}
            </div>
          </div>
          {tab === "dia" && (
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setTopDay(null)}
            >
              Usar TOP base
            </button>
          )}
        </div>

        <div className="mt-2 max-w-[520px]">
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
          <div className="p-6 text-center text-slate-500 dark:text-slate-400">Cargando...</div>
        ) : (
          gestoresVisible.map((g) => {
            const selected = asignadosPorGestor(g.value);
            const diff = diffSets(baseMap[g.value] || [], selected);
          
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
              <div
                key={g.value}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                style={{ minHeight: cardMinH }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Gestor</div>
                    <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{g.label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTopGestor(g.value) && (
                      <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        TOP
                      </span>
                    )}
                    {tab === "dia" && diff.total > 0 && (
                      <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700">
                        +{diff.add} / -{diff.rem}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  {renderCardList(g.value)}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setModalGestor(g.value)}
                    className="px-3 py-1.5 rounded bg-[#30518c] text-white text-xs"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => copyResumenGestor(g.value)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:text-slate-200"
                  >
                    Copiar resumen
                  </button>
                  <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{selected.length} cuadrillas</span>
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
