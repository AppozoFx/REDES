import { ZonaGeometrySchema } from "./schemas";

export type ZonaGeometry = {
  type: "Polygon";
  coordinates: [Array<[number, number]>];
};
export type ZonaGeometryPoint = [number, number];

function toNum(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isSamePoint(a: ZonaGeometryPoint, b: ZonaGeometryPoint) {
  return a[0] === b[0] && a[1] === b[1];
}

export function normalizeZoneGeometry(input: unknown): ZonaGeometry | null {
  if (input == null) return null;
  const raw = typeof input === "string" ? (() => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  })() : input;

  if (!raw || typeof raw !== "object") return null;
  const type = String((raw as any).type || "");
  if (type !== "Polygon") return null;

  const coords = (raw as any).coordinates;
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return null;

  const ring = (coords[0] as unknown[])
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = toNum(point[0]);
      const lat = toNum(point[1]);
      if (lng == null || lat == null) return null;
      return [lng, lat] as ZonaGeometryPoint;
    })
    .filter(Boolean) as ZonaGeometryPoint[];

  if (ring.length < 3) return null;

  const closed = [...ring];
  if (!isSamePoint(closed[0], closed[closed.length - 1])) {
    closed.push(closed[0]);
  }

  const parsed = ZonaGeometrySchema.safeParse({
    type: "Polygon",
    coordinates: [closed],
  });
  return parsed.success ? parsed.data : null;
}

export function zoneGeometryToLatLngs(geometry: ZonaGeometry | null | undefined): [number, number][] {
  const ring = geometry?.coordinates?.[0] || [];
  if (!ring.length) return [];
  return ring.slice(0, Math.max(0, ring.length - 1)).map(([lng, lat]) => [lat, lng] as [number, number]);
}

export function latLngsToZoneGeometry(points: [number, number][]): ZonaGeometry | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat] as [number, number]);
  ring.push(ring[0]);
  return normalizeZoneGeometry({ type: "Polygon", coordinates: [ring] });
}
