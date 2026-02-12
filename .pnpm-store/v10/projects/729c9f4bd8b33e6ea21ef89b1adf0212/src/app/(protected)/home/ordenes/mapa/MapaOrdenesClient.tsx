"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.MapContainer })), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.TileLayer })), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Marker })), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Popup })), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Tooltip })), { ssr: false });
const MarkerClusterGroup = dynamic(
  () => import("react-leaflet-markercluster").then((m: any) => ({ default: m.default || m })),
  { ssr: false }
);

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  cuadrillaNombre: string;
  plan: string;
  direccion: string;
  estado: string;
  tramo: string;
  horaEnCamino: string;
  horaInicio: string;
  horaFin: string;
  tipoServicio: string;
  lat: number;
  lng: number;
};

const colorByEstado: Record<string, string> = {
  Finalizada: "#1d4ed8",
  Cancelada: "#dc2626",
  "En camino": "#7c3aed",
  Iniciada: "#10b981",
  Agendada: "#000000",
  default: "#34495e",
};

const circleIcon = (color: string) =>
  new L.DivIcon({
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });

const clusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count < 10 ? 26 : count < 50 ? 34 : count < 200 ? 42 : 50;
  const bg = count < 10 ? "#1d4ed8" : count < 50 ? "#7c3aed" : count < 200 ? "#dc2626" : "#111827";
  return L.divIcon({
    html: `<div style="background:${bg};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.25);font-weight:700">${count}</div>`,
    className: "cluster-marker",
    iconSize: [size, size],
  });
};

function EstadoPill({ estado }: { estado: string }) {
  const bg = colorByEstado[estado] || colorByEstado.default;
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

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tramoLabel(v: string) {
  const hm = String(v || "").slice(0, 5);
  if (hm === "08:00") return "Primer Tramo";
  if (hm === "12:00") return "Segundo Tramo";
  if (hm === "16:00") return "Tercer Tramo";
  return hm || "-";
}

export function MapaOrdenesClient({ initialYmd }: { initialYmd?: string }) {
  const [isClient, setIsClient] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(initialYmd || todayLimaYmd());
  const [fCuadrilla, setFCuadrilla] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [base, setBase] = useState("osm");
  const mapRef = useRef<any>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [mapHeight, setMapHeight] = useState(600);

  const baseLayers: Record<string, { name: string; url: string; attr: string }> = {
    osm: { name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; OpenStreetMap contributors" },
    voyager: { name: "Carto Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attr: "&copy; OSM, &copy; CARTO" },
    dark: { name: "Carto Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "&copy; OSM, &copy; CARTO" },
  };

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ordenes/mapa/list?ymd=${encodeURIComponent(fecha)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) setRows(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
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

  useEffect(() => {
    const recalc = () => {
      if (!outerRef.current) return;
      const top = outerRef.current.getBoundingClientRect().top;
      const h = Math.max(260, Math.floor(window.innerHeight - top - 48));
      setMapHeight(h);
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  const filtered = useMemo(() => {
    const q = fCuadrilla.trim().toLowerCase();
    return rows.filter((r) => {
      const byCuad = !q || String(r.cuadrillaNombre || "").toLowerCase().includes(q);
      const byEstado = !fEstado || r.estado === fEstado;
      return byCuad && byEstado;
    });
  }, [rows, fCuadrilla, fEstado]);

  const conteoPorEstado = useMemo(() => {
    return filtered.reduce<Record<string, number>>((acc, r) => {
      const k = r.estado || "Sin Estado";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [filtered]);

  useEffect(() => {
    if (!mapRef.current) return;
    const bounds = new L.LatLngBounds([]);
    filtered.forEach((r) => {
      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) bounds.extend([r.lat, r.lng]);
    });
    if (bounds.isValid()) {
      setTimeout(() => mapRef.current.fitBounds(bounds, { padding: [60, 60] }), 120);
    }
  }, [filtered]);

  const clusterKey = `${fecha}|${fCuadrilla}|${fEstado}`;

  return (
    <div className="p-4 overflow-hidden flex flex-col gap-3 min-h-0">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Mapa de Órdenes</h1>
          <p className="text-xs text-muted-foreground">{fecha} | {filtered.length} resultados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border px-3 py-2 rounded" />
          <input type="text" placeholder="Buscar cuadrilla..." value={fCuadrilla} onChange={(e) => setFCuadrilla(e.target.value)} className="border px-3 py-2 rounded" />
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="border px-3 py-2 rounded">
            <option value="">Todos los estados</option>
            <option value="Finalizada">Finalizada</option>
            <option value="Cancelada">Cancelada</option>
            <option value="En camino">En camino</option>
            <option value="Iniciada">Iniciada</option>
            <option value="Agendada">Agendada</option>
          </select>
          <button
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded"
            onClick={() => {
              setFCuadrilla("");
              setFEstado("");
              setFecha(todayLimaYmd());
            }}
          >
            Limpiar
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {["Finalizada", "Cancelada", "En camino", "Iniciada", "Agendada"].map((estado) => (
          <div key={estado} className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full ring-2 ring-white" style={{ backgroundColor: colorByEstado[estado] }} />
            <span>{estado} ({conteoPorEstado[estado] || 0})</span>
          </div>
        ))}
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="text-sm text-muted-foreground">Cargando órdenes...</div> : null}

      <div ref={outerRef} className="relative w-full border rounded overflow-hidden min-h-0" style={{ height: mapHeight }}>
        <div className="absolute right-3 top-3 z-[1000] flex items-center gap-2 bg-white/90 backdrop-blur px-2 py-1 rounded border text-[12px]">
          <span>Mapa:</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} className="bg-transparent outline-none">
            <option value="osm">OpenStreetMap</option>
            <option value="voyager">Carto Voyager</option>
            <option value="dark">Carto Dark</option>
          </select>
        </div>

        {isClient ? (
          <MapContainer center={[-12.05, -77.04]} zoom={11} scrollWheelZoom className="w-full h-full" whenReady={(e: any) => (mapRef.current = e.target)}>
            <TileLayer key={base} attribution={baseLayers[base].attr} url={baseLayers[base].url} />
            <MarkerClusterGroup
              key={clusterKey}
              chunkedLoading
              showCoverageOnHover={false}
              spiderfyOnEveryZoom
              spiderfyOnMaxZoom
              spiderLegPolylineOptions={{ weight: 3, color: "#2563eb", opacity: 0.85 }}
              spiderfyDistanceMultiplier={1.6}
              iconCreateFunction={clusterIcon}
            >
              {filtered.map((r) => {
                const color = colorByEstado[r.estado] || colorByEstado.default;
                return (
                  <Marker key={r.id} position={[r.lat, r.lng]} icon={circleIcon(color)}>
                    <Tooltip permanent direction="top" offset={[0, -14]} opacity={1}>
                      {(r.cuadrillaNombre || "").toUpperCase()}
                    </Tooltip>
                    <Popup maxWidth={560}>
                      <div className="text-xs">
                        <div className="rounded-xl border p-3 bg-white shadow-sm w-[520px] max-w-[80vw]">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="font-semibold text-sm leading-tight">
                              {r.cuadrillaNombre || ""}
                              <div className="text-[11px] text-gray-500">{fecha}</div>
                            </div>
                            <EstadoPill estado={r.estado} />
                          </div>

                          <div className="space-y-1">
                            <div><b>Cliente:</b></div>
                            <div className="font-medium break-words">{r.cliente || "-"}</div>
                            <div><b>Código:</b> {r.codigoCliente || "-"}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div><b>Tramo:</b> {tramoLabel(r.tramo)}</div>
                              <div><b>En camino:</b> {r.horaEnCamino || "-"}</div>
                              <div><b>Inicio:</b> {r.horaInicio || "-"}</div>
                              <div><b>Fin:</b> {r.horaFin || "-"}</div>
                            </div>
                            {r.plan ? (
                              <div className="pt-1">
                                <div><b>Plan:</b></div>
                                <div className="font-medium break-words whitespace-pre-wrap">{r.plan}</div>
                              </div>
                            ) : null}
                            {r.direccion ? (
                              <div className="pt-1">
                                <div><b>Dirección:</b></div>
                                <div className="font-medium break-words whitespace-pre-wrap">{r.direccion}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-3">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-md font-semibold shadow-md hover:shadow-lg transition text-white bg-blue-600"
                            style={{ color: "#ffffff" }}
                          >
                            Google Maps
                          </a>
                          <a
                            href={`https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-md font-semibold shadow-md hover:shadow-lg transition text-white bg-violet-600"
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
            </MarkerClusterGroup>
          </MapContainer>
        ) : null}
      </div>
    </div>
  );
}
