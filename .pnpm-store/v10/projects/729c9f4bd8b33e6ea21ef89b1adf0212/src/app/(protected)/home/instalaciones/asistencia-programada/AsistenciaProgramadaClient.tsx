"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import { toast } from "sonner";
import * as XLSX from "xlsx";

dayjs.extend(customParseFormat);
dayjs.locale("es");

const ESTADOS = [
  "asistencia",
  "descanso",
  "falta",
  "suspendida",
  "descanso medico",
  "vacaciones",
];

type Row = {
  id: string;
  nombre: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type ApiResponse = {
  ok: boolean;
  startYmd: string;
  endYmd: string;
  estado: string;
  items: Record<string, Record<string, string>>;
  feriados?: string[];
  openUntil?: string;
  cuadrillas: Row[];
  canEdit: boolean;
  canAdmin?: boolean;
};

const cls = (...x: (string | false | null | undefined)[]) => x.filter(Boolean).join(" ");

function formatLabel(ymd: string) {
  return dayjs(ymd, "YYYY-MM-DD").format("DD/MM ddd");
}

function toWeekDays(startYmd: string) {
  const start = dayjs(startYmd, "YYYY-MM-DD");
  return Array.from({ length: 7 }).map((_, i) => start.add(i + 1, "day").format("YYYY-MM-DD"));
}

function nextThursdayYmd() {
  const today = dayjs();
  const th = today.day(4);
  return (th.isBefore(today, "day") ? th.add(7, "day") : th).format("YYYY-MM-DD");
}

export default function AsistenciaProgramadaClient() {
  const [startYmd, setStartYmd] = useState(nextThursdayYmd());
  const [endYmd, setEndYmd] = useState(dayjs().add(8, "day").format("YYYY-MM-DD"));
  const [estado, setEstado] = useState("ABIERTO");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<Record<string, Record<string, string>>>({});
  const [cargando, setCargando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [soloDescanso, setSoloDescanso] = useState(false);
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [feriadoDay, setFeriadoDay] = useState("");
  const [feriados, setFeriados] = useState<string[]>([]);
  const [openUntil, setOpenUntil] = useState("");
  const [canAdmin, setCanAdmin] = useState(false);
  const [contador, setContador] = useState("");

  const weekDays = useMemo(() => toWeekDays(startYmd), [startYmd]);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/instalaciones/asistencia-programada?start=${encodeURIComponent(startYmd)}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      setEndYmd(data.endYmd || dayjs(startYmd).add(7, "day").format("YYYY-MM-DD"));
      setEstado(data.estado || "ABIERTO");
      const nextRows = data.cuadrillas || [];
      setRows(nextRows);
      const merged = { ...(data.items || {}) } as Record<string, Record<string, string>>;
      const weekDaysLocal = toWeekDays(startYmd);
      const sundayDays = weekDaysLocal.filter((d) => dayjs(d).day() === 0);
      nextRows.forEach((r) => {
        const row = { ...(merged[r.id] || {}) };
        weekDaysLocal.forEach((d) => {
          if (!row[d]) row[d] = "asistencia";
        });
        sundayDays.forEach((d) => {
          if (!row[d]) row[d] = "descanso";
        });
        merged[r.id] = row;
      });
      setItems(merged);
      setFeriados(Array.isArray(data.feriados) ? data.feriados : []);
      setOpenUntil(String(data.openUntil || ""));
      setCanEdit(!!data.canEdit);
      setCanAdmin(!!data.canAdmin);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la programacion");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("asistencia_programada_start") : null;
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setStartYmd(saved);
  }, []);

  useEffect(() => {
    const end = dayjs(startYmd).add(7, "day").format("YYYY-MM-DD");
    setEndYmd(end);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startYmd]);

  const updateCell = (cid: string, ymd: string, value: string) => {
    setItems((prev) => {
      const next = { ...prev };
      next[cid] = { ...(next[cid] || {}), [ymd]: value };
      return next;
    });
  };

  const setRowAll = (cid: string, value: string) => {
    setItems((prev) => {
      const next = { ...prev };
      const row = { ...(next[cid] || {}) };
      weekDays.forEach((d) => { row[d] = value; });
      next[cid] = row;
      return next;
    });
  };

  const setAllRowsForDay = (ymd: string, value: string) => {
    if (!ymd) return;
    setItems((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        const row = { ...(next[r.id] || {}) };
        row[ymd] = value;
        next[r.id] = row;
      });
      return next;
    });
  };

  const descansoCount = (cid: string) => {
    let c = 0;
    weekDays.forEach((d) => {
      const v = String(items?.[cid]?.[d] || "asistencia").toLowerCase();
      if (v === "descanso") c++;
    });
    return c;
  };

  const validar = () => {
    const maxDesc = feriados.length > 0 ? 2 : 1;
    for (const r of rows) {
      const c = descansoCount(r.id);
      if (c > maxDesc) return { ok: false, msg: `La cuadrilla ${r.nombre} tiene ${c} descansos. Maximo ${maxDesc}.` };
    }
    return { ok: true, msg: "OK" };
  };

  const guardar = async () => {
    const v = validar();
    if (!v.ok) return toast.error(v.msg);
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startYmd, endYmd, items, feriados, openUntil }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Programacion guardada");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const copiarSemanaAnterior = async () => {
    const prevStart = dayjs(startYmd).subtract(7, "day").format("YYYY-MM-DD");
    setCargando(true);
    try {
      const res = await fetch(`/api/instalaciones/asistencia-programada?start=${encodeURIComponent(prevStart)}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      const prevItems = data.items || {};
      setItems(prevItems);
      toast.success("Semana anterior copiada");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo copiar");
    } finally {
      setCargando(false);
    }
  };

  const cerrarSemana = async (nextEstado: "ABIERTO" | "CERRADO") => {
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startYmd, estado: nextEstado }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success(nextEstado === "CERRADO" ? "Semana cerrada" : "Semana abierta");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar estado");
    }
  };

  const confirmarCerrar = () => {
    toast("Cerrar semana?", {
      description: "Al cerrar, los coordinadores no podran editar hasta que se vuelva a abrir.",
      action: {
        label: "Confirmar",
        onClick: () => cerrarSemana("CERRADO"),
      },
      cancel: {
        label: "Cancelar",
        onClick: () => {},
      },
    });
  };

  const confirmarAbrir = () => {
    toast("Abrir semana?", {
      description: "Se habilitara la edicion para coordinadores.",
      action: {
        label: "Confirmar",
        onClick: () => cerrarSemana("ABIERTO"),
      },
      cancel: {
        label: "Cancelar",
        onClick: () => {},
      },
    });
  };

  const visibleRows = useMemo(() => {
    let base = rows;
    if (coordinadorUid) {
      base = base.filter((r) => String(r.coordinadorUid || "") === String(coordinadorUid));
    }
    if (soloDescanso) base = base.filter((r) => descansoCount(r.id) > 0);
    return [...base].sort((a, b) => {
      const ac = a.coordinadorNombre || "";
      const bc = b.coordinadorNombre || "";
      if (ac !== bc) return ac.localeCompare(bc, "es", { sensitivity: "base" });
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
  }, [rows, soloDescanso, items, coordinadorUid]);

  const isLocked = estado === "CERRADO" || !canEdit;

  const sinAsistencia = useMemo(() => {
    return rows.filter((r) => {
      return weekDays.every((d) => String(items?.[r.id]?.[d] || "asistencia").toLowerCase() !== "asistencia");
    });
  }, [rows, weekDays, items]);

  const coordinadoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const uid = String(r.coordinadorUid || "");
      if (uid) map.set(uid, String(r.coordinadorNombre || uid));
    });
    return Array.from(map.entries())
      .map(([uid, nombre]) => ({ uid, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [rows]);

  const estadoColor = (v: string) => {
    switch (String(v || "").toLowerCase()) {
      case "asistencia":
        return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case "falta":
        return "bg-rose-50 border-rose-200 text-rose-700";
      case "suspendida":
        return "bg-orange-50 border-orange-200 text-orange-700";
      case "descanso":
        return "bg-slate-50 border-slate-200 text-slate-700";
      case "descanso medico":
        return "bg-indigo-50 border-indigo-200 text-indigo-700";
      case "vacaciones":
        return "bg-blue-50 border-blue-200 text-blue-700";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700";
    }
  };

  const exportarExcel = () => {
    const estadoCode = (v: string) => {
      const s = String(v || "").toLowerCase();
      if (s === "asistencia") return "A";
      if (s === "falta") return "F";
      if (s === "descanso") return "D";
      if (s === "descanso medico") return "DM";
      if (s === "vacaciones") return "V";
      if (s === "suspendida") return "S";
      return s ? s.toUpperCase() : "";
    };
    const rowsToExport = visibleRows;
    const sheet = rowsToExport.map((r) => {
      const base: Record<string, string> = {
        Cuadrilla: r.nombre,
        Coordinador: r.coordinadorNombre || "-",
      };
      weekDays.forEach((d) => {
        const key = dayjs(d).format("DD/MM/YYYY");
        base[key] = estadoCode(String(items?.[r.id]?.[d] || "asistencia"));
      });
      return base;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Asistencia");
    XLSX.writeFile(wb, `asistencia_programada_${startYmd}_a_${endYmd}.xlsx`);
  };

  useEffect(() => {
    if (!openUntil) {
      setContador("");
      return;
    }
    const tick = () => {
      const now = dayjs();
      const end = dayjs(openUntil);
      const diff = end.diff(now, "second");
      if (diff <= 0) {
        setContador("Cerrado");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setContador(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [openUntil]);

  const setOpenUntilTime = (time: string) => {
    if (!time) {
      setOpenUntil("");
      return;
    }
    const baseDate = dayjs(startYmd).format("YYYY-MM-DD");
    setOpenUntil(`${baseDate}T${time}`);
  };

  const totalVisible = visibleRows.length;
  const conDescanso = visibleRows.filter((r) => descansoCount(r.id) > 0).length;
  const sinDescansoCount = Math.max(0, totalVisible - conDescanso);

  const handleStartChange = (next: string) => {
    if (!next || next === startYmd) return;
    const day = dayjs(next).day(); // 0=Sunday, 4=Thursday
    if (day !== 4) {
      toast("Cambiar inicio de semana?", {
        description: "El inicio recomendado es jueves. Confirma si deseas cambiarlo.",
        action: {
          label: "Confirmar",
          onClick: () => {
            setStartYmd(next);
            if (typeof window !== "undefined") window.localStorage.setItem("asistencia_programada_start", next);
          },
        },
        cancel: {
          label: "Cancelar",
          onClick: () => {},
        },
      });
      return;
    }
    setStartYmd(next);
    if (typeof window !== "undefined") window.localStorage.setItem("asistencia_programada_start", next);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#30518c]">Programacion semanal de asistencia</h1>
            <p className="text-sm text-slate-500">Semana de 7 dias. Domingo descanso. Max 1 descanso, 2 si hay feriado.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cls("px-2 py-1 text-xs rounded border", estado === "CERRADO" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>
              {estado}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Inicio</label>
              <input
                type="date"
                value={startYmd}
                onChange={(e) => handleStartChange(e.target.value)}
                className="border rounded px-3 py-2"
              />
            </div>
            <span className="text-xs text-slate-500">Fin: {dayjs(endYmd).format("DD/MM/YYYY")}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Cuadrillas visibles</div>
            <div className="text-lg font-semibold text-slate-800">{totalVisible}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Con descanso</div>
            <div className="text-lg font-semibold text-slate-800">{conDescanso}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Sin descanso</div>
            <div className="text-lg font-semibold text-slate-800">{sinDescansoCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Feriados marcados</div>
            <div className="text-lg font-semibold text-slate-800">{feriados.length}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Filtros</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">Coordinador</label>
              <select
                value={coordinadorUid}
                onChange={(e) => setCoordinadorUid(e.target.value)}
                className="px-2 py-1.5 rounded border text-sm"
              >
                <option value="">Todos</option>
                {coordinadoresUnicos.map((c) => (
                  <option key={c.uid} value={c.uid}>{c.nombre}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={soloDescanso} onChange={(e) => setSoloDescanso(e.target.checked)} />
                Solo con descanso
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Acciones de semana</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="px-3 py-1.5 rounded border text-sm" onClick={copiarSemanaAnterior}>Copiar semana anterior</button>
              <div className="flex items-center gap-2">
                <select
                  value={feriadoDay}
                  onChange={(e) => setFeriadoDay(e.target.value)}
                  className="px-2 py-1.5 rounded border text-sm"
                >
                  <option value="">Feriado (elige dia)</option>
                  {weekDays.map((d) => (
                    <option key={d} value={d}>{formatLabel(d)}</option>
                  ))}
                </select>
                <button
                  className="px-3 py-1.5 rounded border text-sm"
                  onClick={() => {
                    if (!feriadoDay) return;
                    setAllRowsForDay(feriadoDay, "descanso");
                    setFeriados((prev) => (prev.includes(feriadoDay) ? prev : [...prev, feriadoDay]));
                  }}
                  disabled={isLocked || !feriadoDay}
                >
                  Marcar feriado
                </button>
              </div>
              <button
                className="px-3 py-1.5 rounded border text-sm"
                onClick={() => {
                  const sundays = weekDays.filter((d) => dayjs(d).day() === 0);
                  sundays.forEach((d) => setAllRowsForDay(d, "descanso"));
                }}
                disabled={isLocked}
              >
                Domingo descanso
              </button>
              <button
                className="px-3 py-1.5 rounded bg-[#30518c] text-white text-sm shadow hover:bg-[#203a66]"
                onClick={exportarExcel}
              >
                Descargar Excel
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Control</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!canAdmin && estado === "CERRADO" && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Semana cerrada. Si necesitas cambios, comunicate con Gerencia.
                </span>
              )}
              {sinAsistencia.length > 0 && (
                <span className="text-xs text-rose-600">Sin asistencia semanal: {sinAsistencia.length}</span>
              )}
              {estado === "CERRADO" ? (
                <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                  <div className="text-xs font-semibold">Semana cerrada</div>
                  <div className="text-sm">
                    Semana del {dayjs(weekDays[0]).format("DD/MM/YYYY")} al {dayjs(weekDays[weekDays.length - 1]).format("DD/MM/YYYY")}
                  </div>
                </div>
              ) : (
                openUntil && (
                  <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                    <div className="text-xs font-semibold">Cierre coordinadores</div>
                    <div className="text-sm">{dayjs(openUntil).format("DD/MM/YYYY HH:mm")}</div>
                    <div className="text-xl font-bold tracking-wider">{contador || "--:--:--"}</div>
                  </div>
                )
              )}
              {canAdmin && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600">Cierre coord.</label>
                  <input
                    type="time"
                    value={openUntil ? dayjs(openUntil).format("HH:mm") : ""}
                    onChange={(e) => setOpenUntilTime(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                  />
                </div>
              )}
              <div className="flex flex-col items-start">
                <button
                  onClick={guardar}
                  disabled={saving || isLocked}
                  className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
                <span className="text-[11px] text-slate-500">Solo actualiza cambios.</span>
              </div>
              <div className="flex flex-col items-start">
                <button
                  onClick={() => (estado === "CERRADO" ? confirmarAbrir() : confirmarCerrar())}
                  className={cls("px-4 py-2 rounded text-white text-sm", estado === "CERRADO" ? "bg-slate-600" : "bg-rose-600")}
                >
                  {estado === "CERRADO" ? "Abrir edicion" : "Cerrar semana"}
                </button>
                <span className="text-[11px] text-slate-500">
                  {estado === "CERRADO" ? "Permite editar nuevamente." : "Bloquea edicion a coordinadores."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-auto">
        {cargando ? (
          <div className="p-6 text-center text-slate-500">Cargando...</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">Cuadrilla</th>
                {weekDays.map((d) => (
                  <th key={d} className="p-2 text-left">{formatLabel(d)}</th>
                ))}
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const dc = descansoCount(r.id);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium text-slate-700">{r.nombre}</div>
                      <div className="text-[11px] text-slate-500">{r.coordinadorNombre || "-"}</div>
                    </td>
                    {weekDays.map((d) => (
                      <td key={`${r.id}_${d}`} className="p-2">
                        <select
                          value={String(items?.[r.id]?.[d] || "asistencia")}
                          onChange={(e) => updateCell(r.id, d, e.target.value)}
                          disabled={isLocked}
                          className={cls("border rounded px-2 py-1 text-xs", dc > (feriados.length > 0 ? 2 : 1) ? "border-rose-400" : "", estadoColor(String(items?.[r.id]?.[d] || "asistencia")))}
                        >
                          {ESTADOS.map((e) => (
                            <option key={e} value={e}>{e}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setRowAll(r.id, "asistencia")} disabled={isLocked} className="px-2 py-1 border rounded text-xs">De Largo</button>
                        <span className={cls("text-xs", dc > (feriados.length > 0 ? 2 : 1) ? "text-rose-600" : "text-slate-500")}>Descansos: {dc}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={weekDays.length + 2} className="p-6 text-center text-slate-500">Sin cuadrillas para mostrar</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
