"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toast } from "sonner";

// ---------- tipos ----------

type Refrigerio = { inicioAt: string | null; finAt: string | null; duracionMin: number };

type JornadaDoc = {
  uid: string;
  ymd: string;
  estadoTurno: string;
  ingresoAt: string | null;
  salidaAt: string | null;
  refrigerio: Refrigerio;
};

type GestorItem = { uid: string; nombre: string };

type DayRow = { uid: string; nombre: string; jornada: Omit<JornadaDoc, "uid" | "ymd"> | null };

type DayResponse = { ok: true; mode: "day"; ymd: string; rows: DayRow[] };
type MonthResponse = { ok: true; mode: "month"; month: string; gestores: GestorItem[]; jornadas: JornadaDoc[] };
type ApiResponse = DayResponse | MonthResponse;

// ---------- helpers fecha ----------

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentMonth() {
  return todayYmd().slice(0, 7);
}

function daysInMonth(month: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const count = new Date(year, mon, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function fmtHora(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  }).format(d);
}

function fmtFecha(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ---------- badge ----------

function estadoBadge(estado: string | undefined) {
  if (!estado) return { label: "Sin registro", cls: "border-slate-200 bg-slate-50 text-slate-400" };
  if (estado === "EN_TURNO") return { label: "En turno", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (estado === "EN_REFRIGERIO") return { label: "Refrigerio", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (estado === "FINALIZADO") return { label: "Finalizado", cls: "border-slate-300 bg-slate-100 text-slate-600" };
  return { label: estado, cls: "border-slate-200 bg-slate-50 text-slate-500" };
}

function cellColor(estado: string | undefined) {
  if (!estado) return "bg-rose-50 text-rose-300";
  if (estado === "EN_TURNO") return "bg-emerald-50 text-emerald-700";
  if (estado === "EN_REFRIGERIO") return "bg-amber-50 text-amber-700";
  if (estado === "FINALIZADO") return "bg-slate-50 text-slate-600";
  return "bg-slate-50 text-slate-400";
}

// ---------- export día ----------

function exportarDia(rows: DayRow[], ymd: string) {
  const data = rows.map((r) => ({
    Gestor: r.nombre,
    Estado: r.jornada?.estadoTurno || "SIN_REGISTRO",
    Ingreso: fmtHora(r.jornada?.ingresoAt ?? null),
    "Refrig. inicio": fmtHora(r.jornada?.refrigerio.inicioAt ?? null),
    "Refrig. fin": fmtHora(r.jornada?.refrigerio.finAt ?? null),
    "Refrig. (min)": r.jornada?.refrigerio.duracionMin ?? "",
    Salida: fmtHora(r.jornada?.salidaAt ?? null),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jornadas");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `jornadas_gestores_${ymd}.xlsx`);
}

// ---------- export mes ----------

function exportarMes(
  gestores: GestorItem[],
  jornadasMap: Map<string, JornadaDoc>,
  days: string[],
  month: string
) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Detalle (una fila por gestor × dia)
  const detalle: Record<string, string | number>[] = [];
  for (const g of gestores) {
    for (const day of days) {
      const j = jornadasMap.get(`${g.uid}_${day}`);
      detalle.push({
        Gestor: g.nombre,
        Fecha: fmtFecha(day),
        Estado: j?.estadoTurno || "SIN_REGISTRO",
        Ingreso: fmtHora(j?.ingresoAt ?? null),
        "Refrig. inicio": fmtHora(j?.refrigerio?.inicioAt ?? null),
        "Refrig. fin": fmtHora(j?.refrigerio?.finAt ?? null),
        "Refrig. (min)": j?.refrigerio?.duracionMin ?? "",
        Salida: fmtHora(j?.salidaAt ?? null),
      });
    }
  }
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  wsDetalle["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle por dia");

  // Hoja 2: Resumen matriz (gestores × dias, celda = hora ingreso)
  const headers = ["Gestor", ...days.map((d) => d.slice(8))]; // solo número de día
  const matrizRows = gestores.map((g) => {
    const row: Record<string, string | number> = { Gestor: g.nombre };
    for (const day of days) {
      const j = jornadasMap.get(`${g.uid}_${day}`);
      row[day.slice(8)] = fmtHora(j?.ingresoAt ?? null);
    }
    return row;
  });
  const wsResumen = XLSX.utils.json_to_sheet(matrizRows, { header: headers });
  wsResumen["!cols"] = [{ wch: 28 }, ...days.map(() => ({ wch: 7 }))];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen matriz");

  // Hoja 3: Conteo por gestor
  const conteoRows = gestores.map((g) => {
    const jornadasGestor = days.map((d) => jornadasMap.get(`${g.uid}_${d}`));
    const diasConIngreso = jornadasGestor.filter((j) => j?.ingresoAt).length;
    const diasFinalizados = jornadasGestor.filter((j) => j?.estadoTurno === "FINALIZADO").length;
    const totalRefrigerio = jornadasGestor.reduce((acc, j) => acc + (j?.refrigerio?.duracionMin || 0), 0);
    return {
      Gestor: g.nombre,
      "Dias con ingreso": diasConIngreso,
      "Dias finalizados": diasFinalizados,
      "Dias sin registro": days.length - diasConIngreso,
      "Total refrig. (min)": totalRefrigerio,
    };
  });
  const wsConteo = XLSX.utils.json_to_sheet(conteoRows);
  wsConteo["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsConteo, "Conteo por gestor");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `jornadas_gestores_${month}.xlsx`);
}

// ---------- componente ----------

export function GestorJornadasClient() {
  const [modo, setModo] = useState<"dia" | "mes">("dia");
  const [ymd, setYmd] = useState(todayYmd);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setData(null);
    try {
      const url =
        modo === "mes"
          ? `/api/admin/gestor-jornadas?month=${month}`
          : `/api/admin/gestor-jornadas?ymd=${ymd}`;
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as ApiResponse);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar las jornadas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, ymd, month]);

  // ---- datos modo día ----
  const dayRows = data?.mode === "day" ? (data as DayResponse).rows : [];
  const dayConIngreso = dayRows.filter((r) => r.jornada?.ingresoAt).length;
  const dayFinalizados = dayRows.filter((r) => r.jornada?.estadoTurno === "FINALIZADO").length;
  const daySinRegistro = dayRows.filter((r) => !r.jornada).length;

  // ---- datos modo mes ----
  const monthData = data?.mode === "month" ? (data as MonthResponse) : null;
  const gestores = monthData?.gestores ?? [];
  const days = useMemo(() => (monthData ? daysInMonth(monthData.month) : []), [monthData]);
  const jornadasMap = useMemo(() => {
    const m = new Map<string, JornadaDoc>();
    if (monthData) {
      for (const j of monthData.jornadas) {
        m.set(`${j.uid}_${j.ymd}`, j);
      }
    }
    return m;
  }, [monthData]);

  const mesConIngreso = useMemo(() => {
    if (!monthData) return 0;
    return new Set(monthData.jornadas.filter((j) => j.ingresoAt).map((j) => j.uid)).size;
  }, [monthData]);
  const mesSinRegistroHoy = useMemo(() => {
    if (!monthData) return 0;
    const hoy = todayYmd();
    if (!days.includes(hoy)) return 0;
    return gestores.filter((g) => !jornadasMap.has(`${g.uid}_${hoy}`)).length;
  }, [monthData, days, gestores, jornadasMap]);

  return (
    <div className="space-y-4">
      {/* tabs modo */}
      <div className="flex gap-1 rounded-lg border bg-slate-50 p-1 w-fit">
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

      {/* controles */}
      <div className="flex flex-wrap items-center gap-3">
        {modo === "dia" ? (
          <>
            <input
              type="date"
              value={ymd}
              onChange={(e) => setYmd(e.target.value)}
              className="h-9 rounded border px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => setYmd(todayYmd())}
              className="h-9 rounded border bg-slate-100 px-3 text-sm hover:bg-slate-200"
            >
              Hoy
            </button>
          </>
        ) : (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded border px-3 text-sm"
          />
        )}
        <button
          type="button"
          onClick={cargar}
          disabled={loading}
          className="h-9 rounded bg-slate-800 px-4 text-sm text-white disabled:opacity-50 hover:bg-slate-700"
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>

        {/* botón export */}
        {!loading && data && (
          <button
            type="button"
            onClick={() => {
              if (data.mode === "day") {
                exportarDia((data as DayResponse).rows, (data as DayResponse).ymd);
              } else {
                exportarMes(gestores, jornadasMap, days, (data as MonthResponse).month);
              }
            }}
            className="h-9 rounded border border-emerald-600 bg-emerald-50 px-4 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Exportar Excel
          </button>
        )}
      </div>

      {/* chips resumen */}
      {data && (
        <div className="flex flex-wrap gap-2 text-sm">
          {data.mode === "day" ? (
            <>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                Con ingreso: <b>{dayConIngreso}</b>
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                Finalizados: <b>{dayFinalizados}</b>
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600">
                Sin registro: <b>{daySinRegistro}</b>
              </span>
              <span className="rounded-full border px-3 py-1 text-slate-500">
                Total: <b>{dayRows.length}</b>
              </span>
            </>
          ) : (
            <>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                Gestores con ingreso algún día: <b>{mesConIngreso}</b>
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-600">
                Sin registro hoy: <b>{mesSinRegistroHoy}</b>
              </span>
              <span className="rounded-full border px-3 py-1 text-slate-500">
                Gestores: <b>{gestores.length}</b> · Días: <b>{days.length}</b>
              </span>
            </>
          )}
        </div>
      )}

      {/* tabla modo día */}
      {modo === "dia" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border-b px-4 py-3 text-left font-semibold">Gestor</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Estado</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Ingreso</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. inicio</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. fin</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Refrig. (min)</th>
                <th className="border-b px-4 py-3 text-left font-semibold">Salida</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Cargando...</td>
                </tr>
              )}
              {!loading && dayRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Sin datos para esta fecha.
                  </td>
                </tr>
              )}
              {dayRows.map((r) => {
                const badge = estadoBadge(r.jornada?.estadoTurno);
                return (
                  <tr key={r.uid} className={`border-b last:border-b-0 ${!r.jornada ? "bg-rose-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.nombre}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-2 py-1 text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.jornada?.ingresoAt ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.jornada?.refrigerio.inicioAt ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.jornada?.refrigerio.finAt ?? null)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {r.jornada ? r.jornada.refrigerio.duracionMin : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{fmtHora(r.jornada?.salidaAt ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* tabla modo mes: matriz gestor × dia */}
      {modo === "mes" && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Cargando...</div>
          )}
          {!loading && monthData && (
            <table className="border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r bg-slate-100 px-4 py-3 text-left font-semibold min-w-[180px]">
                    Gestor
                  </th>
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
                {gestores.map((g) => (
                  <tr key={g.uid} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 border-r bg-white px-4 py-2 font-medium text-slate-800">
                      {g.nombre}
                    </td>
                    {days.map((day) => {
                      const j = jornadasMap.get(`${g.uid}_${day}`);
                      const hora = fmtHora(j?.ingresoAt ?? null);
                      const isFuture = day > todayYmd();
                      return (
                        <td
                          key={day}
                          title={
                            j
                              ? `${j.estadoTurno} | Ingreso: ${hora} | Salida: ${fmtHora(j.salidaAt)}`
                              : isFuture
                              ? "Fecha futura"
                              : "Sin registro"
                          }
                          className={`px-1 py-2 text-center tabular-nums ${
                            isFuture
                              ? "text-slate-300"
                              : cellColor(j?.estadoTurno)
                          }`}
                        >
                          {isFuture ? "" : hora}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {gestores.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1} className="px-4 py-8 text-center text-slate-400">
                      No hay gestores habilitados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* leyenda mes */}
      {modo === "mes" && !loading && monthData && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-300" />
            En turno / Finalizado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-300" />
            Refrigerio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-rose-50 border border-rose-200" />
            Sin registro
          </span>
          <span className="text-slate-400">Celda muestra hora de ingreso. Hover para detalle.</span>
        </div>
      )}
    </div>
  );
}
