"use client";

import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import "leaflet/dist/leaflet.css";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.MapContainer })), { ssr: false }) as ComponentType<any>;
const TileLayer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.TileLayer })), { ssr: false }) as ComponentType<any>;
const Marker = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Marker })), { ssr: false }) as ComponentType<any>;
const Popup = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Popup })), { ssr: false }) as ComponentType<any>;
const Tooltip = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Tooltip })), { ssr: false }) as ComponentType<any>;
const Polygon = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Polygon })), { ssr: false }) as ComponentType<any>;

type SupervisorRow = {
  uid: string;
  nombre: string;
  cuadrillaIds: string[];
  zonasIds: string[];
  ordenesTotal: number;
  ordenesGeo: number;
};

type ZoneRow = {
  id: string;
  nombre: string;
  zona: string;
  tipo: string;
  distritos: string[];
  supervisorUids: string[];
  supervisorNombres: string[];
  cuadrillaIds: string[];
  cuadrillaNombres: string[];
  ordenesTotal: number;
  ordenesGeo: number;
};

type VisibleZoneRow = ZoneRow & {
  visibleOrders: number;
  activeCuadrillaIds: string[];
};

type OrdenRow = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  estado: string;
  estadoNorm: string;
  direccion: string;
  plan: string;
  tramo: string;
  horaEnCamino: string;
  horaInicio: string;
  horaFin: string;
  tipoServicio: string;
  region: string;
  distrito: string;
  hora: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  zonaId: string;
  zonaNombre: string;
  zonaSource: string;
  supervisorUid: string;
  supervisorNombre: string;
  supervisorStatus: string;
  lat: number | null;
  lng: number | null;
};

type ApiData = {
  ok: boolean;
  ymd: string;
  mode: "DIA" | "BASE" | "ZONA";
  supervisores: SupervisorRow[];
  zonas: ZoneRow[];
  ordenes: OrdenRow[];
  statusCounts: Record<string, number>;
};

type LatLng = [number, number];

type SupervisorTracking = {
  uid: string;
  nombre: string;
  nombreCorto: string;
  vehiculoPlaca: string;
  lat: number;
  lng: number;
  lastLocationAt: number | null;
  estadoJornada: string;
};

const LIMA_CENTER: LatLng = [-12.055, -77.045];
const SUP_COLOR = "#7c3aed";
const PALETTE = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be123c", "#4d7c0f", "#9333ea", "#0f766e"];

const STATUS_LABEL: Record<string, string> = {
  ASIGNADO_CUADRILLA: "Por cuadrilla",
  ASIGNADO_ZONA: "Por zona",
  ASIGNADO_REGION: "Por region",
  CONFLICTO_ZONA: "Conflicto zona",
  CONFLICTO_REGION: "Conflicto region",
  SIN_SUPERVISOR: "Sin supervisor",
};

const FAMILY_COLORS: Record<string, string> = {
  NORTE: "#2563eb",
  CENTRO: "#059669",
  OESTE: "#7c3aed",
  ESTE: "#ea580c",
  SUR: "#dc2626",
};

const colorByEstado: Record<string, string> = {
  Finalizada: "#1d4ed8",
  Cancelada: "#dc2626",
  "En camino": "#7c3aed",
  Iniciada: "#10b981",
  Agendada: "#000000",
  default: "#34495e",
};

function hashText(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function supervisorColor(uid: string) {
  if (!uid) return "#64748b";
  return PALETTE[hashText(uid) % PALETTE.length];
}

function orderColor(order: OrdenRow) {
  if (colorByEstado[order.estado]) return colorByEstado[order.estado];
  if (order.estadoNorm.includes("FINALIZ")) return "#1d4ed8";
  if (order.estadoNorm.includes("CANCEL")) return "#dc2626";
  if (order.estadoNorm.includes("CAMINO")) return "#7c3aed";
  if (order.estadoNorm.includes("INICI")) return "#10b981";
  if (order.estadoNorm.includes("AGEND")) return "#000000";
  return colorByEstado.default;
}

function orderIcon(leaflet: any, color: string) {
  return new leaflet.DivIcon({
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });
}

function supervisorTrackingIcon(leaflet: any) {
  return new leaflet.DivIcon({
    html: `<div style="background:${SUP_COLOR};width:32px;height:32px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(124,58,237,0.35),0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">&#128119;</div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function formatRelTime(ms: number | null): string {
  if (!ms) return "Sin datos";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Hace menos de 1 min";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `Hace ${hrs} h ${mins % 60} min`;
}

function EstadoPill({ estado, estadoNorm }: { estado: string; estadoNorm: string }) {
  const bg = orderColor({ estado, estadoNorm } as OrdenRow);
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        borderRadius: 9999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-block",
      }}
    >
      {estado || "Sin estado"}
    </span>
  );
}

function tramoLabel(v: string) {
  const hm = String(v || "").slice(0, 5);
  if (hm === "08:00") return "Primer Tramo";
  if (hm === "12:00") return "Segundo Tramo";
  if (hm === "16:00") return "Tercer Tramo";
  return hm || "-";
}

function normalizeRegionFamily(value: string) {
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
  return raw.replace(/^REGION\s+/, "").replace(/\bLIMA\b/g, "").replace(/\b\d+\b/g, "").trim() || raw;
}

function zoneColor(zone: ZoneRow) {
  const family = normalizeRegionFamily(zone.zona || zone.nombre);
  if (FAMILY_COLORS[family]) return FAMILY_COLORS[family];
  if (zone.supervisorUids.length > 1) return "#f97316";
  if (zone.supervisorUids.length === 1) return supervisorColor(zone.supervisorUids[0]);
  return "#64748b";
}

function statusBadgeClass(status: string) {
  if (status === "ASIGNADO_CUADRILLA") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "ASIGNADO_ZONA") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "ASIGNADO_REGION") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "CONFLICTO_ZONA" || status === "CONFLICTO_REGION") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function labelStatus(status: string) {
  return STATUS_LABEL[status] || status || "Sin supervisor";
}

function hasGeo(order: OrdenRow): order is OrdenRow & { lat: number; lng: number } {
  return typeof order.lat === "number" && typeof order.lng === "number";
}

function compactNames(names: string[], fallback = "-") {
  const clean = names.map((name) => String(name || "").trim()).filter(Boolean);
  if (!clean.length) return fallback;
  if (clean.length <= 2) return clean.join(", ");
  return `${clean.slice(0, 2).join(", ")} +${clean.length - 2}`;
}

function regionFamilyLabel(value: string) {
  return normalizeRegionFamily(value);
}

function bboxPolygon(points: LatLng[]): LatLng[] {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = Math.max(0.006, (maxLat - minLat) * 0.35 || 0.006);
  const padLng = Math.max(0.006, (maxLng - minLng) * 0.35 || 0.006);
  return [
    [minLat - padLat, minLng - padLng],
    [minLat - padLat, maxLng + padLng],
    [maxLat + padLat, maxLng + padLng],
    [maxLat + padLat, minLng - padLng],
  ];
}

function convexHull(points: LatLng[]): LatLng[] {
  const unique = Array.from(new Map(points.map((p) => [`${p[0].toFixed(6)},${p[1].toFixed(6)}`, p])).values());
  if (unique.length < 3) return bboxPolygon(unique);

  const sorted = unique
    .map(([lat, lng]) => ({ lat, lng }))
    .sort((a, b) => a.lng - b.lng || a.lat - b.lat);

  const cross = (o: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const lower: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: typeof sorted = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return bboxPolygon(unique);
  return hull.map((p) => [p.lat, p.lng] as LatLng);
}

function formatMode(mode?: string) {
  if (mode === "ZONA") return "Asignacion por region";
  return mode === "DIA" ? "Asignacion diaria" : "Asignacion base";
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export default function DistribucionZonasClient({ initialYmd }: { initialYmd: string }) {
  const [isClient, setIsClient] = useState(false);
  const [leaflet, setLeaflet] = useState<any | null>(null);
  const [fecha, setFecha] = useState(initialYmd);
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fSupervisor, setFSupervisor] = useState("");
  const [fZona, setFZona] = useState("");
  const [fCuadrilla, setFCuadrilla] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [base, setBase] = useState("voyager");
  const [openFamily, setOpenFamily] = useState("");
  const [showSupervisores, setShowSupervisores] = useState(true);
  const [supervisoresTracking, setSupervisoresTracking] = useState<SupervisorTracking[]>([]);
  const mapRef = useRef<any>(null);

  const baseLayers: Record<string, { name: string; url: string; attr: string }> = {
    osm: { name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; OpenStreetMap contributors" },
    voyager: { name: "Carto Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attr: "&copy; OSM, &copy; CARTO" },
    dark: { name: "Carto Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "&copy; OSM, &copy; CARTO" },
  };

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    let mounted = true;
    import("leaflet")
      .then((m: any) => {
        if (!mounted) return;
        setLeaflet(m?.default || m);
      })
      .catch(() => setLeaflet(null));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/instalaciones/distribucion-zonas?ymd=${encodeURIComponent(fecha)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(String(payload?.error || "ERROR"));
        if (!cancelled) setData(payload as ApiData);
      } catch (e: any) {
        if (!cancelled) {
          setData(null);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [fecha]);

  // Polling supervisores en ruta cada 60s
  useEffect(() => {
    let cancelled = false;
    async function fetchTracking() {
      try {
        const res = await fetch("/api/supervisores/tracking", { cache: "no-store" });
        const payload = await res.json();
        if (!cancelled && payload?.ok) setSupervisoresTracking(payload.items || []);
      } catch {
        // silencioso
      }
    }
    fetchTracking();
    const id = window.setInterval(fetchTracking, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const cuadrillaOptions = useMemo(() => {
    const map = new Map<string, string>();
    (data?.ordenes || []).forEach((order) => {
      if (order.cuadrillaId) map.set(order.cuadrillaId, order.cuadrillaNombre || order.cuadrillaId);
    });
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [data]);

  const estadoOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.ordenes || []).forEach((order) => { if (order.estado) set.add(order.estado); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [data]);

  const filteredOrders = useMemo(() => {
    const orders = data?.ordenes || [];
    return orders.filter((order) => {
      if (fSupervisor && order.supervisorUid !== fSupervisor) return false;
      if (fZona && order.zonaId !== fZona) return false;
      if (fCuadrilla && order.cuadrillaId !== fCuadrilla) return false;
      if (fEstado && order.estado !== fEstado) return false;
      return true;
    });
  }, [data, fSupervisor, fZona, fCuadrilla, fEstado]);

  const geoOrders = useMemo(() => filteredOrders.filter(hasGeo), [filteredOrders]);

  const zonesForPanel = useMemo(() => {
    const counts = new Map<string, number>();
    const cuadsByZone = new Map<string, Set<string>>();
    filteredOrders.forEach((order) => {
      if (!order.zonaId) return;
      counts.set(order.zonaId, (counts.get(order.zonaId) || 0) + 1);
      if (order.cuadrillaId) {
        const s = cuadsByZone.get(order.zonaId) || new Set<string>();
        s.add(order.cuadrillaId);
        cuadsByZone.set(order.zonaId, s);
      }
    });

    return (data?.zonas || [])
      .map((zone) => ({
        ...zone,
        visibleOrders: counts.get(zone.id) || 0,
        activeCuadrillaIds: Array.from(cuadsByZone.get(zone.id) || []),
      }))
      .filter((zone) => (fSupervisor ? zone.supervisorUids.includes(fSupervisor) || zone.visibleOrders > 0 : true))
      .filter((zone) => (fZona ? zone.id === fZona : true))
      .filter((zone) => (fCuadrilla ? zone.cuadrillaIds.includes(fCuadrilla) || zone.activeCuadrillaIds.length > 0 : true))
      .sort((a, b) => b.visibleOrders - a.visibleOrders || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })) as VisibleZoneRow[];
  }, [data, fSupervisor, fZona, fCuadrilla, filteredOrders]);

  const familiesForPanel = useMemo(() => {
    const grouped = new Map<string, VisibleZoneRow[]>();
    for (const zone of zonesForPanel) {
      const family = regionFamilyLabel(zone.zona || zone.nombre) || zone.nombre;
      const list = grouped.get(family) || [];
      list.push(zone);
      grouped.set(family, list);
    }
    return Array.from(grouped.entries())
      .map(([family, zones]) => {
        const uniqueCuadrillas = new Set<string>();
        zones.forEach((z) => z.activeCuadrillaIds.forEach((id) => uniqueCuadrillas.add(id)));
        return {
          family,
          color: FAMILY_COLORS[family] || supervisorColor(family),
          total: uniqueCuadrillas.size,
          totalOrdenes: zones.reduce((acc, z) => acc + z.visibleOrders, 0),
          zones: zones.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })),
        };
      })
      .sort((a, b) => b.total - a.total || a.family.localeCompare(b.family, "es", { sensitivity: "base" }));
  }, [zonesForPanel]);

  const polygons = useMemo(() => {
    const zoneById = new Map((data?.zonas || []).map((zone) => [zone.id, zone]));
    const pointsByZone = new Map<string, LatLng[]>();

    geoOrders.forEach((order) => {
      if (!order.zonaId) return;
      const list = pointsByZone.get(order.zonaId) || [];
      list.push([order.lat, order.lng]);
      pointsByZone.set(order.zonaId, list);
    });

    return Array.from(pointsByZone.entries())
      .map(([zoneId, points]) => {
        const zone = zoneById.get(zoneId);
        if (!zone || !points.length) return null;
        return {
          zone,
          color: zoneColor(zone),
          points: convexHull(points),
        };
      })
      .filter(Boolean) as Array<{ zone: ZoneRow; color: string; points: LatLng[] }>;
  }, [data, geoOrders]);

  const stats = useMemo(() => {
    const total = data?.ordenes.length || 0;
    const geo = (data?.ordenes || []).filter(hasGeo).length;
    const assigned = (data?.ordenes || []).filter((order) => order.supervisorUid).length;
    const noSupervisor = (data?.ordenes || []).filter((order) => order.supervisorStatus === "SIN_SUPERVISOR").length;
    const conflicts = (data?.ordenes || []).filter((order) => order.supervisorStatus === "CONFLICTO_ZONA" || order.supervisorStatus === "CONFLICTO_REGION").length;
    return { total, geo, assigned, noSupervisor, conflicts, filtered: filteredOrders.length };
  }, [data, filteredOrders.length]);

  const mapCenter = useMemo<LatLng>(() => {
    if (!geoOrders.length) return LIMA_CENTER;
    const lat = geoOrders.reduce((sum, order) => sum + order.lat, 0) / geoOrders.length;
    const lng = geoOrders.reduce((sum, order) => sum + order.lng, 0) / geoOrders.length;
    return [lat, lng];
  }, [geoOrders]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoOrders.length) return;
    const timer = window.setTimeout(() => {
      try {
        map.fitBounds(
          geoOrders.map((order) => [order.lat, order.lng]),
          { padding: [30, 30], maxZoom: 14 }
        );
      } catch {
        map.setView(mapCenter, 11);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [geoOrders, mapCenter]);

  const currentLayer = baseLayers[base] || baseLayers.voyager;
  const orderList = filteredOrders.slice(0, 250);

  return (
    <main className="min-h-dvh bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Instalaciones</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Distribucion por zonas</h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {formatMode(data?.mode)} - {data?.ymd || fecha}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Dia
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Supervisor
              <select
                value={fSupervisor}
                onChange={(e) => setFSupervisor(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Todos</option>
                {(data?.supervisores || []).map((sup) => (
                  <option key={sup.uid} value={sup.uid}>{sup.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Cuadrilla
              <select
                value={fCuadrilla}
                onChange={(e) => setFCuadrilla(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Todas</option>
                {cuadrillaOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Zona
              <select
                value={fZona}
                onChange={(e) => setFZona(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Todas</option>
                {(data?.zonas || []).map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Estado orden
              <select
                value={fEstado}
                onChange={(e) => setFEstado(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Todos</option>
                {estadoOptions.map((est) => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Mapa
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {Object.entries(baseLayers).map(([key, layer]) => (
                  <option key={key} value={key}>{layer.name}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label="Ordenes" value={stats.total} />
          <Metric label="Con geo" value={stats.geo} />
          <Metric label="Asignadas" value={stats.assigned} />
          <Metric label="Sin supervisor" value={stats.noSupervisor} />
          <Metric label="Conflictos" value={stats.conflicts} />
          <Metric label="Filtradas" value={stats.filtered} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Regiones</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{familiesForPanel.length} grupos visibles</div>
              </div>
              {fZona && (
                <button
                  type="button"
                  onClick={() => setFZona("")}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="max-h-[680px] overflow-y-auto p-3">
              {loading && !data ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">Cargando...</div>
              ) : familiesForPanel.length ? (
                <div className="space-y-2">
                  {familiesForPanel.map((family) => {
                    const familySelected = fZona ? family.zones.some((zone) => zone.id === fZona) : false;
                    const isOpen = openFamily === family.family || familySelected;
                    return (
                      <div
                        key={family.family}
                        className={`rounded-lg border p-3 transition ${
                          familySelected
                            ? "border-[#30518c] bg-[#edf4ff] shadow-sm dark:border-blue-400 dark:bg-blue-950/40"
                            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFamily((current) => (current === family.family ? "" : family.family))}
                          className="flex w-full items-start justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: family.color }} />
                              <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{family.family}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {family.zones.length} regiones
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="shrink-0 text-right">
                              <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {family.total} cuad.
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                {family.totalOrdenes} órd.
                              </div>
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{isOpen ? "▾" : "▸"}</span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="mt-3 space-y-2">
                          {family.zones.map((zone) => {
                            const selected = fZona === zone.id;
                            const color = zoneColor(zone);
                            return (
                              <button
                                key={zone.id}
                                type="button"
                                onClick={() => setFZona(selected ? "" : zone.id)}
                                className={`w-full rounded-lg border p-3 text-left transition ${
                                  selected
                                    ? "border-[#30518c] bg-[#edf4ff] shadow-sm dark:border-blue-400 dark:bg-blue-950/40"
                                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                      <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{zone.nombre}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{compactNames(zone.supervisorNombres, "Sin supervisor")}</div>
                                  </div>
                                  <div className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {zone.visibleOrders}
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                  <div>
                                    <span className="font-semibold">{zone.activeCuadrillaIds.length}</span>
                                    <span className="text-slate-400"> / {zone.cuadrillaIds.length}</span>
                                    {" "}cuadrillas
                                  </div>
                                  <div>
                                    <span className="font-semibold">{zone.ordenesGeo}</span> con geo
                                  </div>
                                  <div>
                                    <span className="font-semibold">{zone.visibleOrders}</span> órdenes
                                  </div>
                                </div>
                              </button>
                              );
                          })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">Sin zonas para el filtro.</div>
              )}
            </div>
          </aside>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Mapa operativo</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{geoOrders.length} ordenes ubicadas</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupervisores((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    showSupervisores
                      ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  <span>👷</span>
                  {showSupervisores
                    ? `${supervisoresTracking.length} supervisor${supervisoresTracking.length !== 1 ? "es" : ""} en ruta`
                    : "Mostrar supervisores"}
                </button>
                {Object.entries(STATUS_LABEL).map(([status, label]) => (
                  <span key={status} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
                    {label}: {data?.statusCounts?.[status] || 0}
                  </span>
                ))}
              </div>
            </div>

            <div className="h-[680px] w-full bg-slate-100 dark:bg-slate-950">
              {isClient ? (
                <MapContainer
                  center={mapCenter}
                  zoom={11}
                  minZoom={9}
                  maxZoom={19}
                  ref={mapRef}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer attribution={currentLayer.attr} url={currentLayer.url} />
                  {polygons.map(({ zone, color, points }) => (
                    <Polygon
                      key={zone.id}
                      positions={points}
                      pathOptions={{ color, weight: 2, opacity: 0.85, fillColor: color, fillOpacity: 0.16 }}
                    >
                      <Tooltip sticky>
                        <div className="text-xs">
                          <div className="font-bold">{zone.nombre}</div>
                          <div>{compactNames(zone.supervisorNombres, "Sin supervisor")}</div>
                          <div>{zone.ordenesTotal} ordenes</div>
                        </div>
                      </Tooltip>
                    </Polygon>
                  ))}
                  {geoOrders.map((order) => {
                    const color = orderColor(order);
                    return (
                      <Marker
                        key={order.id}
                        position={[order.lat, order.lng]}
                        icon={leaflet ? orderIcon(leaflet, color) : undefined}
                        zIndexOffset={order.supervisorUid ? 300 : 0}
                      >
                        <Tooltip permanent direction="top" offset={[0, -14]} opacity={1}>
                          {(order.cuadrillaNombre || "").toUpperCase()}
                        </Tooltip>
                        <Popup maxWidth={560}>
                          <div className="text-xs">
                            <div className="w-[520px] max-w-[80vw] rounded-xl border bg-white p-3 shadow-sm">
                              <div className="mb-2 flex items-start justify-between gap-3">
                                <div className="text-sm font-semibold leading-tight">
                                  {order.cuadrillaNombre || ""}
                                  <div className="text-[11px] text-gray-500">{data?.ymd || fecha}</div>
                                </div>
                                <EstadoPill estado={order.estado} estadoNorm={order.estadoNorm} />
                              </div>

                              <div className="space-y-1">
                                <div><b>Cliente:</b></div>
                                <div className="break-words font-medium">{order.cliente || "-"}</div>
                                <div><b>Codigo:</b> {order.codigoCliente || "-"}</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  <div><b>Tramo:</b> {tramoLabel(order.tramo || order.hora)}</div>
                                  <div><b>En camino:</b> {order.horaEnCamino || "-"}</div>
                                  <div><b>Inicio:</b> {order.horaInicio || "-"}</div>
                                  <div><b>Fin:</b> {order.horaFin || "-"}</div>
                                </div>
                                {order.plan ? (
                                  <div className="pt-1">
                                    <div><b>Plan:</b></div>
                                    <div className="break-words whitespace-pre-wrap font-medium">{order.plan}</div>
                                  </div>
                                ) : null}
                                {order.direccion ? (
                                  <div className="pt-1">
                                    <div><b>Direccion:</b></div>
                                    <div className="break-words whitespace-pre-wrap font-medium">{order.direccion}</div>
                                  </div>
                                ) : null}
                                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-slate-600">
                                  <div><b>Orden:</b> {order.ordenId}</div>
                                  <div><b>Supervisor:</b> {order.supervisorNombre || "Sin supervisor"}</div>
                                  <div><b>Region:</b> {order.zonaNombre || "Sin zona"}</div>
                                  <div><b>Distrito:</b> {order.distrito || "-"}</div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-2 pt-3">
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition hover:shadow-lg"
                                style={{ color: "#ffffff" }}
                              >
                                Google Maps
                              </a>
                              <a
                                href={`https://waze.com/ul?ll=${order.lat},${order.lng}&navigate=yes`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md bg-violet-600 px-4 py-2 font-semibold text-white shadow-md transition hover:shadow-lg"
                                style={{ color: "#ffffff" }}
                              >
                                Waze
                              </a>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {/* Supervisores en ruta */}
                  {showSupervisores && supervisoresTracking.map((sup) => (
                    <Marker
                      key={sup.uid}
                      position={[sup.lat, sup.lng]}
                      icon={leaflet ? supervisorTrackingIcon(leaflet) : undefined}
                      zIndexOffset={1000}
                    >
                      <Tooltip permanent direction="top" offset={[0, -18]} opacity={1}>
                        <span style={{ fontWeight: 700, color: SUP_COLOR }}>
                          {sup.nombreCorto.toUpperCase()}
                        </span>
                      </Tooltip>
                      <Popup maxWidth={320}>
                        <div className="w-[280px] rounded-xl border bg-white p-3 shadow-sm text-xs">
                          <div className="mb-2 flex items-center gap-2">
                            <span style={{ background: SUP_COLOR, borderRadius: "50%", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👷</span>
                            <div>
                              <div className="text-sm font-bold text-slate-900">{sup.nombre}</div>
                              <div className="text-[11px] font-semibold uppercase" style={{ color: SUP_COLOR }}>
                                {sup.estadoJornada === "EN_REFRIGERIO" ? "En refrigerio" : "En ruta"}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1 text-slate-700">
                            {sup.vehiculoPlaca && <div><b>Vehículo:</b> {sup.vehiculoPlaca}</div>}
                            <div><b>Última ubicación:</b> {formatRelTime(sup.lastLocationAt)}</div>
                            <div className="text-[10px] text-slate-400">
                              {sup.lat.toFixed(5)}, {sup.lng.toFixed(5)}
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${sup.lat},${sup.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                              style={{ color: "#ffffff" }}
                            >
                              Google Maps
                            </a>
                            <a
                              href={`https://waze.com/ul?ll=${sup.lat},${sup.lng}&navigate=yes`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                              style={{ color: "#ffffff" }}
                            >
                              Waze
                            </a>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500 dark:text-slate-400">Cargando mapa...</div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Supervisores</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{data?.supervisores.length || 0} activos en asignacion</div>
            </div>
            <div className="max-h-[460px] overflow-y-auto p-3">
              {(data?.supervisores || []).map((sup) => {
                const selected = fSupervisor === sup.uid;
                return (
                  <button
                    key={sup.uid}
                    type="button"
                    onClick={() => setFSupervisor(selected ? "" : sup.uid)}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-[#30518c] bg-[#edf4ff] dark:border-blue-400 dark:bg-blue-950/40"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: supervisorColor(sup.uid) }} />
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{sup.nombre}</span>
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{sup.zonasIds.length} regiones</span>
                          <span>{sup.cuadrillaIds.length} cuadrillas</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {sup.ordenesTotal}
                      </div>
                    </div>
                  </button>
                );
              })}
              {!data?.supervisores.length && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">Sin supervisores asignados.</div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Ordenes por distribuir</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredOrders.length} resultado(s){filteredOrders.length > orderList.length ? ` - mostrando ${orderList.length}` : ""}
                </div>
              </div>
              {loading && <div className="text-xs font-semibold text-[#30518c]">Actualizando...</div>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Orden</th>
                    <th className="px-4 py-3">Zona</th>
                    <th className="px-4 py-3">Supervisor</th>
                    <th className="px-4 py-3">Cuadrilla</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Geo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {orderList.map((order) => (
                    <tr key={order.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{order.ordenId}</div>
                        <div className="mt-1 max-w-[260px] truncate text-xs text-slate-500 dark:text-slate-400">{order.cliente || order.direccion || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{order.zonaNombre || "Sin zona"}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {order.region || order.distrito || order.zonaSource || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{order.supervisorNombre || "Sin supervisor"}</div>
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(order.supervisorStatus)}`}>
                          {labelStatus(order.supervisorStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{order.cuadrillaNombre || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700 dark:text-slate-200">{order.estado || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.hora || "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${hasGeo(order) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                          {hasGeo(order) ? "Si" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!orderList.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        Sin ordenes para el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
