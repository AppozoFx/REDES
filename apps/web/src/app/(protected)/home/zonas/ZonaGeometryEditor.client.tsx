"use client";

import { ComponentType, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMap, useMapEvents } from "react-leaflet";

import "leaflet/dist/leaflet.css";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.MapContainer })), { ssr: false }) as ComponentType<any>;
const TileLayer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.TileLayer })), { ssr: false }) as ComponentType<any>;
const Polygon = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Polygon })), { ssr: false }) as ComponentType<any>;
const Polyline = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Polyline })), { ssr: false }) as ComponentType<any>;
const Marker = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Marker })), { ssr: false }) as ComponentType<any>;
const Tooltip = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Tooltip })), { ssr: false }) as ComponentType<any>;

type LatLng = [number, number];
type ZoneGeometry = {
  type: "Polygon";
  coordinates: [Array<[number, number]>];
};

function geometryToPoints(geometry?: ZoneGeometry | null): LatLng[] {
  const ring = geometry?.coordinates?.[0] || [];
  if (!ring.length) return [];
  return ring.slice(0, Math.max(0, ring.length - 1)).map(([lng, lat]) => [lat, lng]);
}

function pointsToGeometry(points: LatLng[]): ZoneGeometry | null {
  if (points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

function formatPoint(point: LatLng) {
  return `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
}

function isSamePoint(a: LatLng, b: LatLng) {
  return a[0] === b[0] && a[1] === b[1];
}

function MapClickCapture({ onAddPoint }: { onAddPoint: (point: LatLng) => void }) {
  useMapEvents({
    click(e: any) {
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = points.map((point) => point as [number, number]);
    try {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    } catch {
      map.setView(points[0], 11);
    }
  }, [map, points]);

  return null;
}

function VertexMarker({
  point,
  index,
  onMove,
  onRemove,
}: {
  point: LatLng;
  index: number;
  onMove: (index: number, point: LatLng) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Marker
      position={point}
      draggable
      eventHandlers={{
        dragend: (e: any) => {
          const ll = e.target.getLatLng();
          onMove(index, [ll.lat, ll.lng]);
        },
        click: () => onRemove(index),
      }}
    >
      <Tooltip sticky>{`Vertice ${index + 1}. Click para borrar.`}</Tooltip>
    </Marker>
  );
}

export default function ZonaGeometryEditor({
  zoneId,
  zoneName,
  distritos,
  initialGeometry,
}: {
  zoneId: string;
  zoneName: string;
  distritos: string[];
  initialGeometry?: ZoneGeometry | null;
}) {
  const [points, setPoints] = useState<LatLng[]>(() => geometryToPoints(initialGeometry));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPoints(geometryToPoints(initialGeometry));
  }, [initialGeometry]);

  const center = useMemo<LatLng>(() => {
    if (!points.length) return [-12.05, -77.05];
    const lat = points.reduce((acc, p) => acc + p[0], 0) / points.length;
    const lng = points.reduce((acc, p) => acc + p[1], 0) / points.length;
    return [lat, lng];
  }, [points]);

  const polygonPoints = useMemo(() => {
    if (points.length < 3) return points;
    return [...points, points[0]];
  }, [points]);

  function addPoint(point: LatLng) {
    setPoints((prev) => [...prev, point]);
    setSaved("");
    setError("");
  }

  function movePoint(index: number, point: LatLng) {
    setPoints((prev) => prev.map((p, i) => (i === index ? point : p)));
    setSaved("");
    setError("");
  }

  function removePoint(index: number) {
    setPoints((prev) => prev.filter((_, i) => i !== index));
    setSaved("");
    setError("");
  }

  async function saveGeometry() {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch(`/api/zonas/${encodeURIComponent(zoneId)}/geometry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: pointsToGeometry(points) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setSaved(points.length >= 3 ? "Poligono guardado" : "Geometria borrada");
    } catch (e: any) {
      setError(String(e?.message || "ERROR"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Poligono de zona</h2>
          <div className="text-xs text-slate-500">
            {zoneName} - {distritos.length ? distritos.join(", ") : "sin distritos"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPoints((prev) => prev.slice(0, -1))}
            className="rounded border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            disabled={!points.length || saving}
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => setPoints([])}
            className="rounded border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            disabled={!points.length || saving}
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={saveGeometry}
            className="rounded border border-[#30518c] bg-[#30518c] px-3 py-2 text-sm text-white hover:bg-[#274471] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar poligono"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[560px] overflow-hidden rounded border border-slate-200">
          <MapContainer center={center} zoom={11} minZoom={9} maxZoom={18} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickCapture onAddPoint={addPoint} />
            <FitBounds points={points} />
            {points.length >= 3 ? (
              <Polygon positions={polygonPoints} pathOptions={{ color: "#30518c", weight: 2, fillColor: "#9db8ea", fillOpacity: 0.2 }} />
            ) : (
              <Polyline positions={polygonPoints} pathOptions={{ color: "#30518c", weight: 2 }} />
            )}
            {points.map((point, index) => (
              <VertexMarker key={`${point[0]}-${point[1]}-${index}`} point={point} index={index} onMove={movePoint} onRemove={removePoint} />
            ))}
          </MapContainer>
        </div>

        <aside className="rounded border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">Vertices</div>
          <div className="mt-2 text-xs text-slate-500">
            Click en el mapa para agregar puntos. Arrastra un vertice para moverlo. Haz click sobre un vertice para borrarlo.
          </div>

          <div className="mt-3 space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {points.map((point, index) => (
              <div key={`${point[0]}-${point[1]}-${index}`} className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
                <div>
                  <div className="font-semibold text-slate-900">Vertice {index + 1}</div>
                  <div className="text-slate-500">{formatPoint(point)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePoint(index)}
                  className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                >
                  Quitar
                </button>
              </div>
            ))}
            {!points.length && (
              <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                No hay vertices. Agrega puntos en el mapa para dibujar el poligono.
              </div>
            )}
          </div>

          {saved && <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{saved}</div>}
          {error && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
          {points.length < 3 && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              Se requieren al menos 3 vertices para guardar.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
