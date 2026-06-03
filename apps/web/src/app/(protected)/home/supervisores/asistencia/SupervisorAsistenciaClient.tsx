"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toast } from "sonner";

const PuntoBaseMapModal = dynamic(
  () => import("./PuntoBaseMapModal.client").then((m) => ({ default: m.PuntoBaseMapModal })),
  { ssr: false, loading: () => null }
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AsistenciaDoc = {
  uid: string;
  ymd: string;
  estado: string;
  horaInicio: string | null;
  horaFin: string | null;
  horaInicioRefrigerio: string | null;
  horaFinRefrigerio: string | null;
  duracionRefrigerioMin: number;
  latInicio: number | null;
  lngInicio: number | null;
  latFin: number | null;
  lngFin: number | null;
};

type SupervisorItem = { uid: string; nombre: string };
type DayRow = { uid: string; nombre: string; asistencia: Omit<AsistenciaDoc, "uid" | "ymd"> | null };
type DayResponse = { ok: true; mode: "day"; ymd: string; rows: DayRow[] };
type MonthResponse = { ok: true; mode: "month"; month: string; supervisores: SupervisorItem[]; asistencias: AsistenciaDoc[] };
type ApiResponse = DayResponse | MonthResponse;

// ─── Helpers fecha ────────────────────────────────────────────────────────────

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function currentMonth() { return todayYmd().slice(0, 7); }

function daysInMonth(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const count = new Date(year, mon, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function fmtHora(hora: string | null) {
  if (!hora) return "-";
  return hora.slice(0, 5); // HH:mm
}

function fmtFecha(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ─── Badge + color ────────────────────────────────────────────────────────────

function estadoBadge(estado: string | undefined) {
  if (!estado || estado === "SIN_INICIAR") return { label: "Sin registro", cls: "border-slate-200 bg-slate-50 text-slate-400" };
  if (estado === "EN_TURNO") return { label: "En ruta", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (estado === "EN_REFRIGERIO") return { label: "Refrigerio", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (estado === "FINALIZADO") return { label: "Finalizado", cls: "border-slate-300 bg-slate-100 text-slate-600" };
  return { label: estado, cls: "border-slate-200 bg-slate-50 text-slate-500" };
}

function cellColor(estado: string | undefined) {
  if (!estado || estado === "SIN_INICIAR") return "bg-rose-50 text-rose-300";
  if (estado === "EN_TURNO") return "bg-emerald-50 text-emerald-700";
  if (estado === "EN_REFRIGERIO") return "bg-amber-50 text-amber-700";
  if (estado === "FINALIZADO") return "bg-slate-50 text-slate-600";
  return "bg-slate-50 text-slate-400";
}

// ─── Exportar Excel ───────────────────────────────────────────────────────────

function exportarDia(rows: DayRow[], ymd: string) {
  const data = rows.map((r) => ({
    Supervisor: r.nombre,
    Estado: r.asistencia?.estado || "SIN_REGISTRO",
    "Inicio ruta": fmtHora(r.asistencia?.horaInicio ?? null),
    "Refrig. inicio": fmtHora(r.asistencia?.horaInicioRefrigerio ?? null),
    "Refrig. fin": fmtHora(r.asistencia?.horaFinRefrigerio ?? null),
    "Refrig. (min)": r.asistencia?.duracionRefrigerioMin ?? "",
    "Fin ruta": fmtHora(r.asistencia?.horaFin ?? null),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asistencia");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `asistencia_supervisores_${ymd}.xlsx`);
}

function exportarMes(
  supervisores: SupervisorItem[],
  asistenciaMap: Map<string, AsistenciaDoc>,
  days: string[],
  month: string
) {
  const wb = XLSX.utils.book_new();

  const detalle = supervisores.flatMap((s) =>
    days.map((day) => {
      const a = asistenciaMap.get(`${s.uid}_${day}`);
      return {
        Supervisor: s.nombre,
        Fecha: fmtFecha(day),
        Estado: a?.estado || "SIN_REGISTRO",
        "Inicio ruta": fmtHora(a?.horaInicio ?? null),
        "Refrig. inicio": fmtHora(a?.horaInicioRefrigerio ?? null),
        "Refrig. fin": fmtHora(a?.horaFinRefrigerio ?? null),
        "Refrig. (min)": a?.duracionRefrigerioMin ?? "",
        "Fin ruta": fmtHora(a?.horaFin ?? null),
      };
    })
  );
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle por dia");

  const matrizRows = supervisores.map((s) => {
    const row: Record<string, string | number> = { Supervisor: s.nombre };
    for (const day of days) {
      const a = asistenciaMap.get(`${s.uid}_${day}`);
      row[day.slice(8)] = fmtHora(a?.horaInicio ?? null);
    }
    return row;
  });
  const wsResumen = XLSX.utils.json_to_sheet(matrizRows, { header: ["Supervisor", ...days.map((d) => d.slice(8))] });
  wsResumen["!cols"] = [{ wch: 28 }, ...days.map(() => ({ wch: 7 }))];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen matriz");

  const conteo = supervisores.map((s) => {
    const jornadas = days.map((d) => asistenciaMap.get(`${s.uid}_${d}`));
    return {
      Supervisor: s.nombre,
      "Días con inicio": jornadas.filter((a) => a?.horaInicio).length,
      "Días finalizados": jornadas.filter((a) => a?.estado === "FINALIZADO").length,
      "Días sin registro": days.length - jornadas.filter((a) => a?.horaInicio).length,
      "Total refrig. (min)": jornadas.reduce((acc, a) => acc + (a?.duracionRefrigerioMin || 0), 0),
    };
  });
  const wsConteo = XLSX.utils.json_to_sheet(conteo);
  XLSX.utils.book_append_sheet(wb, wsConteo, "Conteo por supervisor");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `asistencia_supervisores_${month}.xlsx`);
}

// ─── Punto de base ────────────────────────────────────────────────────────────

type BaseConfig = { lat: number; lng: number; radioMetros: number } | null;

function PuntoBaseSection() {
  const [config, setConfig] = useState<BaseConfig>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ lat: "", lng: "", radioMetros: "500" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetch("/api/supervisores/base-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.oficina) {
          const { lat, lng, radioMetros } = data.oficina;
          setConfig(data.oficina);
          setForm({ lat: String(lat), lng: String(lng), radioMetros: String(radioMetros) });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startEdit = () => {
    if (config) setForm({ lat: String(config.lat), lng: String(config.lng), radioMetros: String(config.radioMetros) });
    setEditing(true);
    setError("");
  };

  const handleMapConfirm = (lat: number, lng: number, radioMetros: number) => {
    setForm({ lat: String(lat), lng: String(lng), radioMetros: String(radioMetros) });
    setShowMap(false);
  };

  const save = async () => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radioMetros = parseInt(form.radioMetros, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setError("Coordenadas inválidas"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/supervisores/base-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, radioMetros }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "ERROR");
      setConfig({ lat, lng, radioMetros });
      setEditing(false);
      toast.success("Punto de base actualizado");
    } catch (e: any) {
      setError(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const mapInitialLat = form.lat ? parseFloat(form.lat) : (config?.lat ?? null);
  const mapInitialLng = form.lng ? parseFloat(form.lng) : (config?.lng ?? null);
  const mapInitialRadio = form.radioMetros ? parseInt(form.radioMetros, 10) : (config?.radioMetros ?? 500);

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Punto de base</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ubicación de partida para validar el inicio de jornada de supervisores
            </p>
          </div>
          {!editing && (
            <div className="flex gap-2">
              {config && (
                <button
                  type="button"
                  onClick={() => { startEdit(); setShowMap(true); }}
                  className="flex items-center gap-1.5 rounded-lg border border-[#30518c]/30 bg-[#30518c]/5 px-3 py-1.5 text-xs font-medium text-[#30518c] hover:bg-[#30518c]/10 dark:border-blue-800/40 dark:bg-blue-950/30 dark:text-blue-300"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Ver en mapa
                </button>
              )}
              <button
                type="button"
                onClick={startEdit}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {config ? "Editar" : "Configurar"}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3 px-4 py-3">
          {loading && <p className="text-sm text-slate-400">Cargando...</p>}

          {!loading && !editing && (
            config ? (
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Latitud</div>
                  <div className="font-mono font-medium text-slate-800 dark:text-slate-200">{config.lat}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Longitud</div>
                  <div className="font-mono font-medium text-slate-800 dark:text-slate-200">{config.lng}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Radio</div>
                  <div className="font-mono font-medium text-slate-800 dark:text-slate-200">{config.radioMetros} m</div>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${config.lat},${config.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto self-center text-xs text-blue-600 underline dark:text-blue-400"
                >
                  Abrir en Google Maps
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sin configurar — los supervisores no podrán iniciar jornada.</p>
            )
          )}

          {!loading && editing && (
            <div className="space-y-3">
              {/* Botón mapa */}
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#30518c]/30 bg-[#30518c]/03 py-3 text-sm font-medium text-[#30518c] transition hover:border-[#30518c]/60 hover:bg-[#30518c]/08 dark:border-blue-800/40 dark:text-blue-300"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Seleccionar en mapa
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="flex-1 border-t border-slate-100 dark:border-slate-800" />
                <span>o ingresa manualmente</span>
                <div className="flex-1 border-t border-slate-100 dark:border-slate-800" />
              </div>

              {/* Inputs manuales */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Latitud</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                    placeholder="-12.0464"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Longitud</label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                    placeholder="-77.0428"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Radio (m, 50–5000)</label>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    value={form.radioMetros}
                    onChange={(e) => setForm((p) => ({ ...p, radioMetros: e.target.value }))}
                    placeholder="500"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-rose-600">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-[#30518c] px-4 py-1.5 text-sm text-white hover:bg-[#253f6e] disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setError(""); }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showMap && (
        <PuntoBaseMapModal
          initialLat={Number.isFinite(mapInitialLat) ? mapInitialLat : null}
          initialLng={Number.isFinite(mapInitialLng) ? mapInitialLng : null}
          initialRadio={Number.isFinite(mapInitialRadio) && mapInitialRadio >= 50 ? mapInitialRadio : 500}
          onConfirm={handleMapConfirm}
          onClose={() => setShowMap(false)}
        />
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SupervisorAsistenciaClient({ canManageBase }: { canManageBase: boolean }) {
  const [modo, setModo] = useState<"dia" | "mes">("dia");
  const [ymd, setYmd] = useState(todayYmd);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setData(null);
    try {
      const url = modo === "mes"
        ? `/api/supervisores/asistencia?month=${month}`
        : `/api/supervisores/asistencia?ymd=${ymd}`;
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as ApiResponse);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la asistencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [modo, ymd, month]); // eslint-disable-line

  const dayRows = data?.mode === "day" ? (data as DayResponse).rows : [];
  const dayConIngreso = dayRows.filter((r) => r.asistencia?.horaInicio).length;
  const dayFinalizados = dayRows.filter((r) => r.asistencia?.estado === "FINALIZADO").length;
  const daySinRegistro = dayRows.filter((r) => !r.asistencia).length;

  const monthData = data?.mode === "month" ? (data as MonthResponse) : null;
  const supervisores = monthData?.supervisores ?? [];
  const days = useMemo(() => (monthData ? daysInMonth(monthData.month) : []), [monthData]);
  const asistenciaMap = useMemo(() => {
    const m = new Map<string, AsistenciaDoc>();
    if (monthData) {
      for (const a of monthData.asistencias) m.set(`${a.uid}_${a.ymd}`, a);
    }
    return m;
  }, [monthData]);

  const mesConIngreso = useMemo(() => {
    if (!monthData) return 0;
    return new Set(monthData.asistencias.filter((a) => a.horaInicio).map((a) => a.uid)).size;
  }, [monthData]);
  const mesSinRegistroHoy = useMemo(() => {
    if (!monthData) return 0;
    const hoy = todayYmd();
    if (!days.includes(hoy)) return 0;
    return supervisores.filter((s) => !asistenciaMap.has(`${s.uid}_${hoy}`)).length;
  }, [monthData, days, supervisores, asistenciaMap]);

  return (
    <div className="space-y-4">
      {/* Tabs modo */}
      <div className="flex w-fit gap-1 rounded-lg border bg-slate-50 p-1">
        {(["dia", "mes"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              modo === m ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "dia" ? "Por día" : "Por mes"}
          </button>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {modo === "dia" ? (
          <>
            <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className="h-9 rounded border px-3 text-sm" />
            <button type="button" onClick={() => setYmd(todayYmd())} className="h-9 rounded border bg-slate-100 px-3 text-sm hover:bg-slate-200">Hoy</button>
          </>
        ) : (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded border px-3 text-sm" />
        )}
        <button type="button" onClick={cargar} disabled={loading} className="h-9 rounded bg-slate-800 px-4 text-sm text-white disabled:opacity-50 hover:bg-slate-700">
          {loading ? "Cargando..." : "Actualizar"}
        </button>
        {!loading && data && (
          <button
            type="button"
            onClick={() => {
              if (data.mode === "day") exportarDia((data as DayResponse).rows, (data as DayResponse).ymd);
              else exportarMes(supervisores, asistenciaMap, days, (data as MonthResponse).month);
            }}
            className="h-9 rounded border border-emerald-600 bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Exportar Excel
          </button>
        )}
      </div>

      {/* Chips resumen */}
      {data && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.mode === "day" ? (
            <>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Con inicio: <b>{dayConIngreso}</b></span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">Finalizados: <b>{dayFinalizados}</b></span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600">Sin registro: <b>{daySinRegistro}</b></span>
              <span className="rounded-full border px-3 py-1 text-slate-500">Total: <b>{dayRows.length}</b></span>
            </>
          ) : (
            <>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Con algún registro: <b>{mesConIngreso}</b></span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600">Sin registro hoy: <b>{mesSinRegistroHoy}</b></span>
              <span className="rounded-full border px-3 py-1 text-slate-500">Supervisores: <b>{supervisores.length}</b> · Días: <b>{days.length}</b></span>
            </>
          )}
        </div>
      )}

      {/* Tabla modo día */}
      {modo === "dia" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border-b px-4 py-3 text-left font-semibold">Supervisor</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Estado</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Inicio ruta</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. inicio</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. fin</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. (min)</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Fin ruta</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Ubic. inicio</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Ubic. fin</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Cargando...</td></tr>}
              {!loading && dayRows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Sin datos para esta fecha.</td></tr>}
              {dayRows.map((r) => {
                const badge = estadoBadge(r.asistencia?.estado);
                return (
                  <tr key={r.uid} className={`border-b last:border-b-0 ${!r.asistencia ? "bg-rose-50/30" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-2 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.asistencia?.horaInicio ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.asistencia?.horaInicioRefrigerio ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.asistencia?.horaFinRefrigerio ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{r.asistencia ? r.asistencia.duracionRefrigerioMin : "-"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.asistencia?.horaFin ?? null)}</td>
                    <td className="px-4 py-3">
                      {r.asistencia?.latInicio && r.asistencia?.lngInicio ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${r.asistencia.latInicio},${r.asistencia.lngInicio}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          Ver mapa
                        </a>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.asistencia?.latFin && r.asistencia?.lngFin ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${r.asistencia.latFin},${r.asistencia.lngFin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline"
                        >
                          Ver mapa
                        </a>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla modo mes: matriz supervisor × día */}
      {modo === "mes" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          {loading && <div className="px-4 py-8 text-center text-sm text-slate-400">Cargando...</div>}
          {!loading && monthData && (
            <table className="border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r bg-slate-100 px-4 py-3 text-left font-semibold min-w-[180px]">Supervisor</th>
                  {days.map((day) => (
                    <th key={day} className="border-b px-2 py-3 text-center font-semibold min-w-[52px]">
                      <div>{day.slice(8)}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {new Date(day + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" })}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervisores.map((s) => (
                  <tr key={s.uid} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 border-r bg-white px-4 py-2 font-medium text-slate-800">{s.nombre}</td>
                    {days.map((day) => {
                      const a = asistenciaMap.get(`${s.uid}_${day}`);
                      const hora = fmtHora(a?.horaInicio ?? null);
                      const isFuture = day > todayYmd();
                      return (
                        <td
                          key={day}
                          title={a ? `${a.estado} | Inicio: ${hora} | Fin: ${fmtHora(a.horaFin)}` : isFuture ? "Fecha futura" : "Sin registro"}
                          className={`px-1 py-2 text-center tabular-nums ${isFuture ? "text-slate-300" : cellColor(a?.estado)}`}
                        >
                          {isFuture ? "" : hora}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {supervisores.length === 0 && (
                  <tr><td colSpan={days.length + 1} className="px-4 py-8 text-center text-slate-400">No hay supervisores habilitados.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Leyenda mes */}
      {modo === "mes" && !loading && monthData && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-300" />En ruta / Finalizado</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-300" />Refrigerio</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-rose-50 border border-rose-200" />Sin registro</span>
          <span className="text-slate-400">Celda muestra hora de inicio. Hover para detalle.</span>
        </div>
      )}

      {/* Punto de base */}
      {canManageBase && (
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <PuntoBaseSection />
        </div>
      )}
    </div>
  );
}
