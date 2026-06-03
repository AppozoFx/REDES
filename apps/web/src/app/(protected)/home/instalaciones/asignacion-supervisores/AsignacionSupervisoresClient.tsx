"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Opt = { value: string; label: string };
type AssignMap = Record<string, string[]>;

type ZoneRow = {
  id: string;
  nombre: string;
  familia: string;
  distritos: string[];
  ordenesTotal: number;
  ordenesGeo: number;
  cuadrillaIds: string[];
  cuadrillaNombres: string[];
};

type ApiResponse = {
  ok: boolean;
  fecha: string;
  supervisores: Opt[];
  zonas: ZoneRow[];
  day: AssignMap;
  error?: string;
};

const FAMILY_COLORS: Record<string, string> = {
  NORTE: "#2563eb",
  CENTRO: "#059669",
  OESTE: "#7c3aed",
  ESTE: "#ea580c",
  SUR: "#dc2626",
};

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateLabel(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function uniq(values: string[]) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeMap(map: AssignMap): AssignMap {
  const out: AssignMap = {};
  Object.entries(map || {}).forEach(([uid, ids]) => {
    out[String(uid || "").trim()] = uniq(ids || []).sort();
  });
  return out;
}

function findDuplicates(map: AssignMap) {
  const used = new Map<string, string[]>();
  Object.entries(map || {}).forEach(([supervisor, ids]) => {
    (ids || []).forEach((id) => {
      const key = String(id || "").trim();
      if (!key) return;
      const owners = used.get(key) || [];
      owners.push(supervisor);
      used.set(key, owners);
    });
  });
  const dup: Record<string, string[]> = {};
  used.forEach((owners, id) => {
    if (owners.length > 1) dup[id] = owners;
  });
  return dup;
}

function normalizeFamily(value: string) {
  const raw = String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  if (raw.includes("NORTE")) return "NORTE";
  if (raw.includes("CENTRO")) return "CENTRO";
  if (raw.includes("OESTE")) return "OESTE";
  if (raw.includes("ESTE")) return "ESTE";
  if (raw.includes("SUR")) return "SUR";
  return raw.split(" ")[0] || raw;
}

function zoneColor(zone: ZoneRow) {
  const family = normalizeFamily(zone.familia || zone.nombre);
  return FAMILY_COLORS[family] || "#64748b";
}

function compactNames(names: string[], fallback = "-") {
  const clean = names.map((name) => String(name || "").trim()).filter(Boolean);
  if (!clean.length) return fallback;
  if (clean.length <= 2) return clean.join(", ");
  return `${clean.slice(0, 2).join(", ")} +${clean.length - 2}`;
}

function familyLabel(value: string) {
  return normalizeFamily(value);
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" }) {
  const valueClass = tone === "amber" ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

export default function AsignacionSupervisoresClient() {
  const [fecha, setFecha] = useState(todayYmd());
  const [supervisores, setSupervisores] = useState<Opt[]>([]);
  const [zonas, setZonas] = useState<ZoneRow[]>([]);
  const [dayMap, setDayMap] = useState<AssignMap>({});
  const [filtroSupervisor, setFiltroSupervisor] = useState("");
  const [soloCambios, setSoloCambios] = useState(false);
  const [modalSupervisor, setModalSupervisor] = useState<string | null>(null);
  const [modalQuery, setModalQuery] = useState("");
  const [cargando, setCargando] = useState(false);
  const [saving, setSaving] = useState(false);

  const cargar = async (ymd: string) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/instalaciones/asignacion-supervisores-zonas?fecha=${encodeURIComponent(ymd)}`, {
        cache: "no-store",
      });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");

      setSupervisores(data.supervisores || []);
      setZonas(data.zonas || []);
      setDayMap(normalizeMap(data.day || {}));
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
    setModalQuery("");
  }, [modalSupervisor]);

  const assignedSet = useMemo(() => {
    const set = new Set<string>();
    Object.values(dayMap).forEach((ids) => (ids || []).forEach((id) => set.add(id)));
    return set;
  }, [dayMap]);

  const unassignedCount = useMemo(() => zonas.filter((zona) => !assignedSet.has(zona.id)).length, [zonas, assignedSet]);

  const duplicateZones = useMemo(() => findDuplicates(dayMap), [dayMap]);
  const dupCount = Object.keys(duplicateZones).length;

  const supervisoresVisible = useMemo(() => {
    const q = filtroSupervisor.trim().toLowerCase();
    let list = supervisores;
    if (q) list = list.filter((sup) => sup.label.toLowerCase().includes(q));
    if (soloCambios) {
      list = list.filter((sup) => (dayMap[sup.value] || []).length > 0);
    }
    return [...list].sort((a, b) => {
      const ac = (dayMap[a.value] || []).length;
      const bc = (dayMap[b.value] || []).length;
      if (ac === 0 && bc > 0) return 1;
      if (ac > 0 && bc === 0) return -1;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });
  }, [supervisores, filtroSupervisor, soloCambios, dayMap]);

  const currentMap = dayMap;

  const zonesByFamily = useMemo(() => {
    const grouped = new Map<string, ZoneRow[]>();
    for (const zone of zonas) {
      const family = familyLabel(zone.familia || zone.nombre) || zone.nombre;
      const list = grouped.get(family) || [];
      list.push(zone);
      grouped.set(family, list);
    }
    return Array.from(grouped.entries())
      .map(([family, list]) => ({
        family,
        color: FAMILY_COLORS[family] || "#64748b",
        total: list.reduce((acc, zone) => acc + zone.ordenesTotal, 0),
        zones: list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })),
      }))
      .sort((a, b) => b.total - a.total || a.family.localeCompare(b.family, "es", { sensitivity: "base" }));
  }, [zonas]);

  const labelByZoneId = useMemo(() => {
    return new Map(zonas.map((zona) => [zona.id, zona.nombre]));
  }, [zonas]);

  const zoneCuadrillaMap = useMemo(() => {
    return new Map(zonas.map((zona) => [zona.id, zona.cuadrillaNombres || []]));
  }, [zonas]);

  const derivedCuadrillas = (regionIds: string[]) => {
    const set = new Set<string>();
    regionIds.forEach((rid) => (zoneCuadrillaMap.get(rid) || []).forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  };

  const supervisorLabel = (uid: string) => supervisores.find((sup) => sup.value === uid)?.label || uid;

  const listNames = (ids: string[]) =>
    (ids || [])
      .map((id) => labelByZoneId.get(id) || id)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const setAsignacion = (uid: string, ids: string[]) => {
    setDayMap({ ...currentMap, [uid]: uniq(ids) });
  };

  const limpiarDia = () => {
    const empty: AssignMap = {};
    supervisores.forEach((sup) => {
      empty[sup.value] = [];
    });
    setDayMap(empty);
    toast.success("Asignacion diaria limpiada");
  };

  const guardar = async () => {
    if (dupCount > 0) {
      toast.error("Hay regiones asignadas a mas de un supervisor");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/asignacion-supervisores-zonas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          supervisoresMap: currentMap,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Asignacion diaria guardada");
      await cargar(fecha);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const availableFor = (uid: string) => {
    const selected = currentMap[uid] || [];
    const selectedSet = new Set(selected);
    return zonas
      .filter((zona) => !assignedSet.has(zona.id) || selectedSet.has(zona.id))
      .filter((zona) => {
        const q = modalQuery.trim().toLowerCase();
        return q ? zona.nombre.toLowerCase().includes(q) || zona.id.toLowerCase().includes(q) || zona.familia.toLowerCase().includes(q) : true;
      });
  };

  const toggleZona = (uid: string, zonaId: string) => {
    const current = currentMap[uid] || [];
    const next = current.includes(zonaId) ? current.filter((id) => id !== zonaId) : [...current, zonaId];
    setAsignacion(uid, next);
  };

  const resumen = useMemo(() => {
    const asignadas = assignedSet.size;
    return {
      supervisores: supervisores.length,
      zonas: zonas.length,
      asignadas,
      sinAsignar: unassignedCount,
    };
  }, [supervisores.length, zonas.length, assignedSet, unassignedCount]);

  return (
    <div className="space-y-4 p-4 text-slate-900 dark:text-slate-100">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="bg-[linear-gradient(135deg,#17345b_0%,#30518c_58%,#eef4fb_58%,#fbfdff_100%)] px-5 py-5 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#1e293b_58%,#334155_100%)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="text-white">
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                Supervision
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Asignacion por zonas</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-50/90">
                Cada region se asigna por dia a un solo supervisor. No usa base permanente.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 text-white">
                <label className="text-sm font-medium text-blue-50/90">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className="rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2 text-slate-900 outline-none [color-scheme:light] dark:border-white/20 dark:bg-white/10 dark:text-white dark:[color-scheme:dark]"
                />
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-blue-50/90">
                  {dateLabel(fecha)}
                </span>
                <button
                  className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                  onClick={() => setFecha(todayYmd())}
                >
                  Hoy
                </button>
                <button
                  className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                  onClick={() => setFecha(addDaysYmd(todayYmd(), 1))}
                >
                  Manana
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 px-5 py-4 md:grid-cols-4 dark:border-slate-700">
          <Metric label="Supervisores" value={resumen.supervisores} />
          <Metric label="Regiones" value={resumen.zonas} />
          <Metric label="Asignadas" value={resumen.asignadas} />
          <Metric label="Sin asignar" value={resumen.sinAsignar} tone={resumen.sinAsignar ? "amber" : "slate"} />
        </div>

        <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={limpiarDia}
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              >
                Limpiar dia
              </button>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={soloCambios}
                  onChange={(event) => setSoloCambios(event.target.checked)}
                />
                Solo con asignacion
              </label>
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              La asignacion diaria se guarda por region. Si una region cambia de supervisor, el mapa de ese dia se ajusta sin tocar instalaciones.
            </p>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="text-sm font-semibold">Busqueda y guardado</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Filtra por supervisor y guarda la configuracion del dia.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={filtroSupervisor}
                onChange={(event) => setFiltroSupervisor(event.target.value)}
                placeholder="Buscar supervisor..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                onClick={guardar}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar dia"}
              </button>
            </div>
          </div>
        </div>

        {dupCount > 0 && (
          <div className="mx-5 mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            Hay {dupCount} region(es) asignadas a mas de un supervisor. Corrige antes de guardar.
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cargando ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Cargando...
          </div>
        ) : (
          supervisoresVisible.map((sup) => {
            const selected = currentMap[sup.value] || [];
            return (
              <article
                key={sup.value}
                className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Supervisor
                      </div>
                      <h2 className="mt-1 text-lg font-semibold">{sup.label}</h2>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                        {selected.length} regiones
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {derivedCuadrillas(selected).length} cuadrillas
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Regiones
                    </div>
                    <div className="min-h-16 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      {selected.length ? (
                        <div className="space-y-0.5 text-xs text-slate-700 dark:text-slate-200">
                          {listNames(selected).map((name) => (
                            <div key={name} className="truncate">— {name}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">Sin regiones asignadas</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Cuadrillas derivadas
                    </div>
                    <div className="min-h-16 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      {derivedCuadrillas(selected).length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {derivedCuadrillas(selected).map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {selected.length ? "Sin órdenes en estas regiones hoy" : "Asigna regiones primero"}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setModalSupervisor(sup.value)}
                    className="mt-1 rounded-xl bg-[#30518c] px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#203a66]"
                  >
                    Editar asignacion
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {!cargando && supervisoresVisible.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No hay supervisores para mostrar.
        </div>
      )}

      {modalSupervisor && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalSupervisor(null)} />
          <div className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[92%] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="border-b border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Supervisor</div>
                  <div className="text-lg font-semibold">{supervisorLabel(modalSupervisor)}</div>
                </div>
                <button
                  onClick={() => setModalSupervisor(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                >
                  Cerrar
                </button>
              </div>
              <input
                value={modalQuery}
                onChange={(event) => setModalQuery(event.target.value)}
                placeholder="Buscar region..."
                className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="overflow-auto p-4">
              <div className="space-y-3">
                {zonesByFamily.map((family) => (
                  <details key={family.family} open className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: family.color }} />
                        <span className="text-sm font-semibold">{family.family}</span>
                      </div>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {family.zones.length}
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                      <div className="space-y-2">
                        {family.zones
                          .filter((zone) => {
                            const q = modalQuery.trim().toLowerCase();
                            return q ? zone.nombre.toLowerCase().includes(q) || zone.id.toLowerCase().includes(q) : true;
                          })
                          .map((zone) => {
                            const selected = (currentMap[modalSupervisor] || []).includes(zone.id);
                            const color = zoneColor(zone);
                            return (
                              <label
                                key={zone.id}
                                className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-sm transition ${
                                  selected
                                    ? "border-[#30518c] bg-[#edf4ff] shadow-sm dark:border-blue-400 dark:bg-blue-950/40"
                                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="truncate font-semibold text-slate-900 dark:text-white">{zone.nombre}</span>
                                  </span>
                                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                    {zone.ordenesTotal} órdenes · {zone.cuadrillaIds?.length || 0} cuadrillas
                                  </span>
                                  <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                                    {compactNames(zone.distritos, "Sin distritos")}
                                  </span>
                                </span>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleZona(modalSupervisor, zone.id)}
                                  className="mt-0.5"
                                />
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  </details>
                ))}
                {zonesByFamily.every((family) => !family.zones.some((zone) => {
                  const q = modalQuery.trim().toLowerCase();
                  return q ? zone.nombre.toLowerCase().includes(q) || zone.id.toLowerCase().includes(q) : true;
                })) && (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No hay regiones disponibles con el filtro actual.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAsignacion(modalSupervisor, [])}
                  className="rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-200"
                >
                  Limpiar supervisor
                </button>
                <button
                  onClick={() => {
                    toast.success("Cambios listos. Recuerda guardar.");
                    setModalSupervisor(null);
                  }}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                >
                  Guardar y cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
