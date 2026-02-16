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

  const cargar = async (ymd: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/instalaciones/asignacion-gestores?fecha=${encodeURIComponent(ymd)}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      setGestores(data.gestores || []);
      setCuadrillas(data.cuadrillas || []);
      setBaseMap(normalizeMap(data.base || {}));
      setDayMap(normalizeMap(data.day || {}));
      setTopBase(Array.isArray(data.topBase) ? data.topBase : []);
      setTopDay(Array.isArray(data.topDay) ? data.topDay : null);
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

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#30518c]">Asignacion de Gestores</h1>
            <p className="text-sm text-slate-500">
              Base permanente (actualiza cuadrillas.gestorUid) y cambios temporales por dia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <span className="text-xs text-slate-500">
              {dayjs(fecha, "YYYY-MM-DD").format("DD/MM/YYYY")}
            </span>
            <button
              className="text-xs px-2 py-1 rounded border hover:bg-slate-50"
              onClick={() => setFecha(dayjs().format("YYYY-MM-DD"))}
            >
              Hoy
            </button>
            <button
              className="text-xs px-2 py-1 rounded border hover:bg-slate-50"
              onClick={() => setFecha(dayjs().add(1, "day").format("YYYY-MM-DD"))}
            >
              Manana
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Gestores</div>
            <div className="text-lg font-semibold text-slate-800">{resumen.totalGestores}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Cuadrillas</div>
            <div className="text-lg font-semibold text-slate-800">{resumen.totalCuadrillas}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Asignadas</div>
            <div className="text-lg font-semibold text-slate-800">{resumen.totalAsignadas}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Sin asignar</div>
            <div className={cls("text-lg font-semibold", unassignedCount > 0 ? "text-rose-700" : "text-slate-800")}>
              {unassignedCount}
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">TOP</div>
            <div className="text-lg font-semibold text-slate-800">{resumen.totalTop}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab("dia")}
            className={cls(
              "px-3 py-1.5 rounded-full text-sm ring-1",
              tab === "dia"
                ? "bg-[#30518c] text-white ring-[#30518c]"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
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
                  : "bg-slate-50 text-slate-600 border-slate-200"
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
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            )}
          >
            Base permanente
          </button>

          {tab === "dia" && (
            <button
              onClick={usarBaseParaDia}
              className="px-3 py-1.5 rounded border text-sm hover:bg-slate-50"
            >
              Usar base para este dia
            </button>
          )}

          {tab === "dia" && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
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
              placeholder="Buscar gestora..."
              value={filtroGestor}
              onChange={(e) => setFiltroGestor(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">Gestora TOP (ve todas las cuadrillas)</div>
            <div className="text-xs text-slate-500">
              {tab === "dia" ? "Si no defines, se usa la base." : "Configuracion base"}
            </div>
          </div>
          {tab === "dia" && (
            <button
              className="text-xs px-2 py-1 rounded border hover:bg-slate-50"
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
            placeholder="Seleccionar gestora(s) TOP"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {cargando ? (
          <div className="p-6 text-center text-slate-500">Cargando...</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">Gestora</th>
                <th className="p-2 text-left">Cuadrillas asignadas</th>
                {tab === "dia" && <th className="p-2 text-left">Cambios</th>}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {gestoresVisible.map((g) => {
                const selected = asignadosPorGestor(g.value);
                const available = cuadrillas.filter((c) => !assignedSet.has(c.value) || selected.includes(c.value));
                const diff = diffSets(baseMap[g.value] || [], selected);
                return (
                  <tr key={g.value} className="border-t">
                    <td className="p-2 font-medium text-slate-700">{g.label}</td>
                    <td className="p-2 min-w-[420px]">
                      <Select
                        isMulti
                        options={available}
                        value={cuadrillas.filter((c) => selected.includes(c.value))}
                        onChange={(sel) => setAsignacion(g.value, (sel || []).map((s) => s.value))}
                        placeholder="Asignar cuadrillas"
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                        menuPosition="fixed"
                        styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                      />
                    </td>
                    {tab === "dia" && (
                      <td className="p-2 text-slate-600">
                        {diff.total === 0 ? (
                          <span className="text-xs px-2 py-1 rounded bg-slate-100">Sin cambios</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700">
                            +{diff.add} / -{diff.rem}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-2 text-right text-slate-600">{selected.length}</td>
                  </tr>
                );
              })}
              {gestoresVisible.length === 0 && (
                <tr>
                  <td colSpan={tab === "dia" ? 4 : 3} className="p-6 text-center text-slate-500">No hay gestoras para mostrar</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
