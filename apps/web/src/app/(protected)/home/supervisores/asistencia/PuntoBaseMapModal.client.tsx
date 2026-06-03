"use client";

import type { ComponentType } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMapEvents, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

// ─── Leaflet components (SSR-safe) ────────────────────────────────────────────

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => ({ default: m.MapContainer })),
  { ssr: false }
) as ComponentType<any>;

const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => ({ default: m.TileLayer })),
  { ssr: false }
) as ComponentType<any>;

const Marker = dynamic(
  () => import("react-leaflet").then((m) => ({ default: m.Marker })),
  { ssr: false }
) as ComponentType<any>;

const Circle = dynamic(
  () => import("react-leaflet").then((m) => ({ default: m.Circle })),
  { ssr: false }
) as ComponentType<any>;

// ─── Types ────────────────────────────────────────────────────────────────────

type Pos = { lat: number; lng: number };
type NominatimResult = { display_name: string; lat: string; lon: string };

const DEFAULT_CENTER: [number, number] = [-12.0464, -77.0428]; // Lima
const DEFAULT_ZOOM = 13;

// ─── Inner map components (need Leaflet context, only render inside MapContainer) ─

function ClickCapture({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: any) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToPos({ target }: { target: Pos | null }) {
  const map = useMap();
  const prev = useRef<Pos | null>(null);

  useEffect(() => {
    if (!target) return;
    if (prev.current?.lat === target.lat && prev.current?.lng === target.lng) return;
    prev.current = target;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [map, target]);

  return null;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export type PuntoBaseMapModalProps = {
  initialLat: number | null;
  initialLng: number | null;
  initialRadio: number;
  onConfirm: (lat: number, lng: number, radioMetros: number) => void;
  onClose: () => void;
};

export function PuntoBaseMapModal({
  initialLat,
  initialLng,
  initialRadio,
  onConfirm,
  onClose,
}: PuntoBaseMapModalProps) {
  const hasInitial = initialLat !== null && initialLng !== null;

  const [pos, setPos] = useState<Pos | null>(
    hasInitial ? { lat: initialLat!, lng: initialLng! } : null
  );
  const [radio, setRadio] = useState(initialRadio || 500);
  const [flyTarget, setFlyTarget] = useState<Pos | null>(
    hasInitial ? { lat: initialLat!, lng: initialLng! } : null
  );
  const [leafletLib, setLeafletLib] = useState<any>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Load Leaflet for icon creation
  useEffect(() => {
    import("leaflet").then((L) => setLeafletLib(L?.default || L));
  }, []);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const markerIcon = leafletLib
    ? new leafletLib.DivIcon({
        html: `<div style="
          width:34px;height:34px;border-radius:50%;
          background:#30518c;
          border:3px solid #fff;
          box-shadow:0 0 0 3px rgba(48,81,140,0.4),0 4px 14px rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;
        "><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg></div>`,
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -34],
      })
    : null;

  const handlePlace = useCallback((lat: number, lng: number) => {
    setPos({ lat, lng });
  }, []);

  const handleDragEnd = useCallback((e: any) => {
    const ll = e.target.getLatLng();
    setPos({ lat: ll.lat, lng: ll.lng });
  }, []);

  const handleSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setShowDropdown(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=pe&accept-language=es`;
      const res = await fetch(url, { headers: { "User-Agent": "REDES-WebApp/1.0" } });
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setSearchError("Sin resultados. Intenta con otra búsqueda.");
      } else {
        setSearchResults(data);
        setShowDropdown(true);
      }
    } catch {
      setSearchError("Error de conexión al buscar.");
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const newPos = { lat, lng };
    setPos(newPos);
    setFlyTarget(newPos);
    setSearchResults([]);
    setShowDropdown(false);
    setSearchQ("");
  };

  const center: [number, number] = hasInitial
    ? [initialLat!, initialLng!]
    : DEFAULT_CENTER;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        style={{ maxWidth: 860, height: "min(92vh, 720px)" }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Seleccionar punto de base
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Haz clic en el mapa para colocar el marcador, o arrástralo para ajustar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="relative shrink-0 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Buscar dirección o lugar en Perú…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-[#30518c] focus:ring-2 focus:ring-[#30518c]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !searchQ.trim()}
              className="flex min-w-[72px] items-center justify-center gap-1.5 rounded-lg bg-[#30518c] px-4 py-2 text-sm font-medium text-white hover:bg-[#253f6e] disabled:opacity-50"
            >
              {searching ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : "Buscar"}
            </button>
          </div>

          {searchError && (
            <p className="mt-1.5 text-xs text-rose-500">{searchError}</p>
          )}

          {/* Dropdown de resultados */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute inset-x-5 top-full z-[1100] mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectResult(r)}
                  className="flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                >
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#30518c]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  <span className="text-xs text-slate-700 dark:text-slate-300">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Map ─────────────────────────────────────────────────────── */}
        <div className="relative min-h-0 flex-1">
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            className="h-full w-full"
            style={{ cursor: "crosshair" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <ClickCapture onPlace={handlePlace} />
            <FlyToPos target={flyTarget} />

            {pos && markerIcon && (
              <>
                <Marker
                  position={[pos.lat, pos.lng]}
                  draggable
                  icon={markerIcon}
                  eventHandlers={{ dragend: handleDragEnd }}
                />
                <Circle
                  center={[pos.lat, pos.lng]}
                  radius={radio}
                  pathOptions={{
                    color: "#30518c",
                    fillColor: "#30518c",
                    fillOpacity: 0.13,
                    weight: 2.5,
                    dashArray: "8 5",
                  }}
                />
              </>
            )}
          </MapContainer>

          {/* Hint flotante cuando no hay marcador */}
          {!pos && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[1000] flex justify-center">
              <span className="rounded-full bg-black/65 px-5 py-2 text-xs font-medium text-white shadow-lg">
                Haz clic en el mapa para colocar el marcador
              </span>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex flex-wrap items-end gap-4">
            {/* Radio */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Radio de validación
                </label>
                <span className="rounded-full bg-[#30518c]/10 px-2 py-0.5 text-xs font-semibold text-[#30518c] dark:bg-blue-950/50 dark:text-blue-300">
                  {radio} m
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={Math.min(radio, 2000)}
                  onChange={(e) => setRadio(Number(e.target.value))}
                  className="flex-1 accent-[#30518c]"
                />
                <input
                  type="number"
                  min={50}
                  max={5000}
                  value={radio}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 50 && v <= 5000) setRadio(v);
                  }}
                  className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-sm font-semibold text-[#30518c] dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400"
                />
              </div>
            </div>

            {/* Coordenadas actuales */}
            {pos ? (
              <div className="flex gap-5 text-xs">
                <div>
                  <div className="text-slate-400 dark:text-slate-500">Latitud</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {pos.lat.toFixed(6)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 dark:text-slate-500">Longitud</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {pos.lng.toFixed(6)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs italic text-slate-400 dark:text-slate-500">Sin posición seleccionada</p>
            )}

            {/* Acciones */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!pos}
                onClick={() => pos && onConfirm(pos.lat, pos.lng, radio)}
                className="rounded-xl bg-[#30518c] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#253f6e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirmar posición
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
