"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const ESTADO_META = {
  asistencia: { label: "Asistencia", short: "A" },
  descanso: { label: "Descanso", short: "D" },
  falta: { label: "Falta", short: "F" },
  suspendida: { label: "Suspendida", short: "S" },
  "descanso medico": { label: "Descanso medico", short: "DM" },
  vacaciones: { label: "Vacaciones", short: "V" },
} as const;

type Row = {
  id: string;
  nombre: string;
  categoria?: string;
  vehiculo?: string;
  numeroCuadrilla?: number;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type CoordinadorEstado = {
  coordinadorUid: string;
  coordinadorNombre: string;
  status: "SIN_INICIAR" | "BORRADOR" | "CONFIRMADO";
  cuadrillas: number;
  updatedAt?: string;
  updatedBy?: string;
  updatedByNombre?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  confirmedByNombre?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedByNombre?: string;
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
  coordinadoresEstado?: CoordinadorEstado[];
  myCoordinatorStatus?: "SIN_INICIAR" | "BORRADOR" | "CONFIRMADO";
  canEdit: boolean;
  canConfirm?: boolean;
  canAdmin?: boolean;
};

const cls = (...x: (string | false | null | undefined)[]) => x.filter(Boolean).join(" ");

function formatLabel(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "-";
  return dayjs(ymd, "YYYY-MM-DD").format("DD/MM ddd");
}

function isSunday(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return dayjs(ymd, "YYYY-MM-DD").day() === 0;
}

function toWeekDays(startYmd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) return [];
  const start = dayjs(startYmd, "YYYY-MM-DD");
  return Array.from({ length: 7 }).map((_, i) => start.add(i + 1, "day").format("YYYY-MM-DD"));
}

function nextThursdayYmd() {
  const today = dayjs();
  const th = today.day(4);
  return (th.isBefore(today, "day") ? th.add(7, "day") : th).format("YYYY-MM-DD");
}

function cuadrillaGroupOrder(row: Row) {
  const categoria = String(row.categoria || "").toUpperCase();
  const vehiculo = String(row.vehiculo || "").toUpperCase();
  const nombre = String(row.nombre || "").toUpperCase();
  if (categoria === "RESIDENCIAL" || nombre.includes("RESIDENCIAL")) return 0;
  if (categoria === "CONDOMINIO" || vehiculo === "MOTO" || nombre.includes("MOTO")) return 1;
  return 2;
}

function statusTone(status: string) {
  if (status === "CONFIRMADO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "BORRADOR") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function statusLabel(status: string) {
  if (status === "CONFIRMADO") return "Confirmado";
  if (status === "BORRADOR") return "En progreso";
  return "Sin iniciar";
}

function asLocalDateTime(value?: string) {
  if (!value) return "-";
  const d = dayjs(value);
  if (!d.isValid()) return "-";
  return d.format("DD/MM/YYYY HH:mm");
}

function Progress({ value = 0 }: { value?: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className="h-2 rounded-full bg-[#27457a] transition-all dark:bg-sky-400" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  help,
  tone = "default",
  progress,
}: {
  label: string;
  value: string;
  help: string;
  tone?: "default" | "good" | "warn" | "bad";
  progress?: number;
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
        : tone === "bad"
          ? "border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950";

  return (
    <div className={cls("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{help}</div>
      {typeof progress === "number" ? <div className="mt-3"><Progress value={progress} /></div> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</div>
      </div>
    </div>
  );
}

export default function AsistenciaProgramadaClient() {
  const [startYmd, setStartYmd] = useState("");
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
  const [canConfirm, setCanConfirm] = useState(false);
  const [myCoordinatorStatus, setMyCoordinatorStatus] = useState<"SIN_INICIAR" | "BORRADOR" | "CONFIRMADO">("SIN_INICIAR");
  const [coordinadoresEstado, setCoordinadoresEstado] = useState<CoordinadorEstado[]>([]);
  const [contador, setContador] = useState("");
  const [openCellMenu, setOpenCellMenu] = useState<string | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const [tableAreaWidth, setTableAreaWidth] = useState(0);

  const weekDays = useMemo(() => toWeekDays(startYmd), [startYmd]);

  const cargar = async (requestedStartYmd?: string) => {
    setCargando(true);
    try {
      const query = requestedStartYmd ? `?start=${encodeURIComponent(requestedStartYmd)}` : "";
      const res = await fetch(`/api/instalaciones/asistencia-programada${query}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      const resolvedStartYmd = String(data.startYmd || requestedStartYmd || nextThursdayYmd()).trim();
      setStartYmd((prev) => (prev === resolvedStartYmd ? prev : resolvedStartYmd));
      setEndYmd(data.endYmd || dayjs(resolvedStartYmd).add(7, "day").format("YYYY-MM-DD"));
      setEstado(data.estado || "ABIERTO");
      const nextRows = data.cuadrillas || [];
      setRows(nextRows);
      const merged = { ...(data.items || {}) } as Record<string, Record<string, string>>;
      const weekDaysLocal = toWeekDays(resolvedStartYmd);
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
      setCanConfirm(!!data.canConfirm);
      setMyCoordinatorStatus(data.myCoordinatorStatus || "SIN_INICIAR");
      setCoordinadoresEstado(Array.isArray(data.coordinadoresEstado) ? data.coordinadoresEstado : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la programacion");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!startYmd) {
      cargar();
      return;
    }
    const end = dayjs(startYmd).add(7, "day").format("YYYY-MM-DD");
    setEndYmd(end);
    cargar(startYmd);
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

  const asistenciaCount = (cid: string) => {
    let c = 0;
    weekDays.forEach((d) => {
      const v = String(items?.[cid]?.[d] || "asistencia").toLowerCase();
      if (v === "asistencia") c++;
    });
    return c;
  };

  const validar = () => {
    const maxDesc = 2;
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

  const confirmarSemana = async () => {
    const v = validar();
    if (!v.ok) return toast.error(v.msg);
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startYmd }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Semana confirmada");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo confirmar");
    }
  };

  const reabrirCoordinador = async (uid: string) => {
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada/reabrir-coordinador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startYmd, coordinadorUid: uid }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success("Coordinador reabierto");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo reabrir");
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

  const confirmarEntrega = () => {
    toast("Confirmar semana?", {
      description: "Tu programacion quedara lista para revision de Gerencia y se bloqueara hasta que te la reabran.",
      action: {
        label: "Confirmar",
        onClick: () => confirmarSemana(),
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
      const groupDiff = cuadrillaGroupOrder(a) - cuadrillaGroupOrder(b);
      if (groupDiff !== 0) return groupDiff;

      const numDiff = Number(a.numeroCuadrilla || 0) - Number(b.numeroCuadrilla || 0);
      if (numDiff !== 0) return numDiff;

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
  const coordinadorActual = coordinadoresUnicos.find((c) => c.uid === coordinadorUid) || null;

  const estadoColor = (v: string) => {
    switch (String(v || "").toLowerCase()) {
      case "asistencia":
        return "bg-emerald-100 border-emerald-300 text-green-700 dark:bg-green-950 dark:border-green-500 dark:text-green-200 dark:ring-1 dark:ring-green-500/40";
      case "falta":
        return "bg-rose-100 border-rose-300 text-red-700 dark:bg-red-950 dark:border-red-500 dark:text-red-200 dark:ring-1 dark:ring-red-500/40";
      case "suspendida":
        return "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950 dark:border-orange-500 dark:text-orange-200 dark:ring-1 dark:ring-orange-500/40";
      case "descanso":
        return "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-500 dark:text-amber-200 dark:ring-1 dark:ring-amber-500/40";
      case "descanso medico":
        return "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-950 dark:border-indigo-500 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-500/40";
      case "vacaciones":
        return "bg-sky-100 border-sky-300 text-sky-800 dark:bg-sky-950 dark:border-sky-500 dark:text-sky-200 dark:ring-1 dark:ring-sky-500/40";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-500 dark:text-slate-200";
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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-asistencia-cell-menu='true']")) return;
      setOpenCellMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const node = tableAreaRef.current;
    if (!node) return;

    const updateWidth = () => {
      setTableAreaWidth(node.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

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
  const coordinadoresConfirmados = coordinadoresEstado.filter((c) => c.status === "CONFIRMADO").length;
  const coordinadoresBorrador = coordinadoresEstado.filter((c) => c.status === "BORRADOR").length;
  const coordinadoresPendientes = coordinadoresEstado.filter((c) => c.status === "SIN_INICIAR").length;
  const ultimaConfirmacion = coordinadoresEstado
    .filter((c) => !!c.confirmedAt)
    .sort((a, b) => dayjs(b.confirmedAt || "").valueOf() - dayjs(a.confirmedAt || "").valueOf())[0];
  const firstColWidth = 220;
  const actionsColWidth = 200;
  const minDayWidth = 104;
  const computedDayWidth = weekDays.length > 0
    ? Math.max(minDayWidth, Math.floor((Math.max(tableAreaWidth, 0) - firstColWidth - actionsColWidth) / weekDays.length))
    : minDayWidth;
  const tableColumns = `${firstColWidth}px repeat(${weekDays.length}, ${computedDayWidth}px) ${actionsColWidth}px`;
  const tableMinWidthPx = firstColWidth + (weekDays.length * computedDayWidth) + actionsColWidth;

  useEffect(() => {
    const bodyEl = bodyScrollRef.current;
    const headerEl = headerScrollRef.current;
    if (!bodyEl || !headerEl) return;

    const syncHeader = () => {
      headerEl.scrollLeft = bodyEl.scrollLeft;
    };

    syncHeader();
    bodyEl.addEventListener("scroll", syncHeader, { passive: true });
    return () => bodyEl.removeEventListener("scroll", syncHeader);
  }, [weekDays.length, visibleRows.length, tableMinWidthPx]);

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
  };

  return (
    <div className="space-y-6 p-4 text-slate-900 dark:text-slate-100">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#13315c_0%,#254b87_55%,#dbe7fb_55%,#f8fbff_100%)] shadow-sm dark:border-slate-700 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_52%,#1e293b_52%,#334155_100%)]">
        <div className="flex flex-col gap-3 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div className="text-white">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">Programacion semanal</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Programacion semanal de asistencia</h1>
            <p className="mt-3 max-w-2xl text-sm text-blue-50/90">
              Semana de 7 dias. Domingo descanso. Maximo 2 descansos por cuadrilla.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-white">
            <span className={cls("rounded-full border px-3 py-1 text-xs font-semibold", estado === "CERRADO" ? "border-rose-200/40 bg-rose-500/15 text-rose-100" : "border-emerald-200/40 bg-emerald-500/15 text-emerald-100")}>
              {estado}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-blue-50/90">Inicio</label>
              <input
                type="date"
                value={startYmd}
                onChange={(e) => handleStartChange(e.target.value)}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white outline-none backdrop-blur placeholder:text-blue-100/70"
              />
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-blue-50/90">Fin: {dayjs(endYmd).format("DD/MM/YYYY")}</span>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr,1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Estado operativo</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cls("rounded-full border px-3 py-1 text-sm font-medium", statusTone(myCoordinatorStatus))}>
                    {canAdmin ? "Vista gerencia" : statusLabel(myCoordinatorStatus)}
                  </span>
                  {!canAdmin && (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {myCoordinatorStatus === "CONFIRMADO"
                        ? "Tu programacion ya fue entregada y queda bloqueada hasta reapertura."
                        : myCoordinatorStatus === "BORRADOR"
                          ? "Tienes avances guardados. Cuando termines, confirma la semana."
                          : "Aun no confirmas esta semana."}
                    </span>
                  )}
                  {canAdmin && (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Supervisa avance, reabre coordinadores y realiza el cierre oficial.
                    </span>
                  )}
                </div>
              </div>
              {canAdmin && (
                <div className="m-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Ultima confirmacion</div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {ultimaConfirmacion ? ultimaConfirmacion.coordinadorNombre : "Sin confirmaciones"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {ultimaConfirmacion ? asLocalDateTime(ultimaConfirmacion.confirmedAt) : "-"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!canAdmin && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Entrega del coordinador</div>
                  <div className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    Guarda avances durante la carga y confirma solo cuando la semana quede lista.
                  </div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Mantiene el mismo flujo visual que la revision de Gerencia, pero solo con tus acciones.
                  </div>
                </div>
                <span className={cls("rounded-full border px-3 py-1 text-xs font-medium", statusTone(myCoordinatorStatus))}>
                  {statusLabel(myCoordinatorStatus)}
                </span>
              </div>
              <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <div className="uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Estado</div>
                    <div className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{statusLabel(myCoordinatorStatus)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <div className="uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Semana</div>
                    <div className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                      {dayjs(weekDays[0]).format("DD/MM")} - {dayjs(weekDays[weekDays.length - 1]).format("DD/MM")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button
                    onClick={guardar}
                    disabled={saving || isLocked}
                    className="rounded-xl bg-[#254b87] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1c3a68] disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    onClick={confirmarEntrega}
                    disabled={!canConfirm || saving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Confirmar semana
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard label="Cuadrillas visibles" value={String(totalVisible)} help="Aplicando filtros actuales" progress={rows.length ? Number(((totalVisible / rows.length) * 100).toFixed(1)) : 0} />
          <MetricCard label="Con descanso" value={String(conDescanso)} help={`${sinDescansoCount} sin descanso programado`} tone="warn" />
          <MetricCard label="Sin asistencia" value={String(sinAsistencia.length)} help="Cuadrillas sin al menos una asistencia" tone={sinAsistencia.length > 0 ? "bad" : "default"} />
          <MetricCard label="Feriados" value={String(feriados.length)} help="Marcados para esta semana" tone="good" />
        </div>

        {canAdmin && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricCard label="Coordinadores" value={String(coordinadoresEstado.length)} help="Visibles en esta semana" />
            <MetricCard label="Confirmados" value={String(coordinadoresConfirmados)} help="Listos para revision" tone="good" progress={coordinadoresEstado.length ? Number(((coordinadoresConfirmados / coordinadoresEstado.length) * 100).toFixed(1)) : 0} />
            <MetricCard label="En progreso" value={String(coordinadoresBorrador)} help="Con avances guardados" tone="warn" />
            <MetricCard label="Sin iniciar" value={String(coordinadoresPendientes)} help="Pendientes de accion" tone={coordinadoresPendientes > 0 ? "bad" : "default"} />
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tipificaciones de asistencia</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Referencia visual semanal para distinguir rapidamente cada estado.</div>
          </div>
          <div className="bg-slate-50 px-4 py-4 dark:bg-slate-950/70">
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((estadoTip) => (
                <span key={estadoTip} className={cls("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", estadoColor(estadoTip))}>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 px-1 text-[10px] shadow-sm dark:bg-slate-950/60">
                    {ESTADO_META[estadoTip as keyof typeof ESTADO_META]?.short || estadoTip.slice(0, 2).toUpperCase()}
                  </span>
                  <span>{ESTADO_META[estadoTip as keyof typeof ESTADO_META]?.label || estadoTip}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ajusta la vista por coordinador o deja solo cuadrillas con descanso.</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-300">Coordinador</label>
              {canAdmin ? (
                <select
                  value={coordinadorUid}
                  onChange={(e) => setCoordinadorUid(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Todos</option>
                  {coordinadoresUnicos.map((c) => (
                    <option key={c.uid} value={c.uid}>{c.nombre}</option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {coordinadoresUnicos[0]?.nombre || "-"}
                </div>
              )}
              {canAdmin && coordinadorActual && (
                <button
                  type="button"
                  onClick={() => setCoordinadorUid("")}
                  className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Ver todos
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={soloDescanso} onChange={(e) => setSoloDescanso(e.target.checked)} />
                Solo con descanso
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Acciones de semana</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Replica acciones rapidas con el mismo tratamiento visual del resumen.</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-200" onClick={copiarSemanaAnterior}>Copiar semana anterior</button>
              <div className="flex items-center gap-2">
                <select
                  value={feriadoDay}
                  onChange={(e) => setFeriadoDay(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Feriado (elige dia)</option>
                  {weekDays.map((d) => (
                    <option key={d} value={d}>{formatLabel(d)}</option>
                  ))}
                </select>
                <button
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-200"
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
                className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-200"
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

          <div className="rounded-[24px] border border-slate-200 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Control</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Estado de cierre, alertas de asistencia y bloqueo de edicion.</div>
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
                  <label className="text-xs text-slate-600 dark:text-slate-300">Cierre coord.</label>
                  <input
                    type="time"
                    value={openUntil ? dayjs(openUntil).format("HH:mm") : ""}
                    onChange={(e) => setOpenUntilTime(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
              {canAdmin && (
                <div className="flex flex-col items-start">
                  <button
                    onClick={guardar}
                    disabled={saving || isLocked}
                    className="rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Gerencia tambien puede ajustar la semana.</span>
                </div>
              )}
              <div className="flex flex-col items-start">
                <button
                  onClick={() => (estado === "CERRADO" ? confirmarAbrir() : confirmarCerrar())}
                  className={cls("px-4 py-2 rounded text-white text-sm", estado === "CERRADO" ? "bg-slate-600" : "bg-rose-600")}
                >
                  {estado === "CERRADO" ? "Abrir edicion" : "Cerrar semana"}
                </button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {estado === "CERRADO" ? "Permite editar nuevamente." : "Bloquea edicion a coordinadores."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {canAdmin && (
          <div className="mt-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">Seguimiento por coordinador</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Gerencia puede ver avance, confirmacion y reabrir coordinadores puntualmente.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {coordinadoresEstado.map((coord) => (
                <div
                  key={coord.coordinadorUid}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCoordinadorUid((prev) => (prev === coord.coordinadorUid ? "" : coord.coordinadorUid))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCoordinadorUid((prev) => (prev === coord.coordinadorUid ? "" : coord.coordinadorUid));
                    }
                  }}
                  className={cls(
                    "rounded-lg border px-3 py-2 text-left transition dark:border-slate-700",
                    coordinadorUid === coord.coordinadorUid
                      ? "border-[#254b87] bg-blue-50 shadow-sm dark:border-sky-500 dark:bg-sky-950/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{coord.coordinadorNombre}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{coord.cuadrillas} cuadrillas</div>
                    </div>
                    <span className={cls("rounded-full border px-2 py-0.5 text-[11px] font-medium", statusTone(coord.status))}>
                      {statusLabel(coord.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <div className="truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Guardado:</span> {asLocalDateTime(coord.updatedAt)}
                    </div>
                    <div className="truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Confirmado:</span> {asLocalDateTime(coord.confirmedAt)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reabrirCoordinador(coord.coordinadorUid);
                      }}
                      disabled={estado === "CERRADO"}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-[10px] font-medium text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                    >
                      Reabrir coordinador
                    </button>
                    {coord.reopenedByNombre && (
                      <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        Reabierto por {coord.reopenedByNombre}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {coordinadoresEstado.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No hay coordinadores visibles para esta semana.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section ref={tableAreaRef} className="relative rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Grilla semanal por cuadrilla</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Cada fila representa una cuadrilla y permite programar la asistencia diaria con mejor lectura visual.</div>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Semana de {dayjs(weekDays[0]).format("DD/MM")} a {dayjs(weekDays[weekDays.length - 1]).format("DD/MM")}
          </div>
        </div>
        <div className="sticky top-[72px] z-40 mb-2">
          <div className="relative mx-auto w-fit overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-900 shadow-[0_12px_24px_rgba(15,23,42,.18)] dark:border-slate-700 dark:bg-slate-950">
            <div className="absolute inset-0 bg-slate-900 dark:bg-slate-950" />
            <div ref={headerScrollRef} className="relative overflow-x-hidden overflow-y-visible">
              <div className="grid text-left text-xs font-semibold uppercase tracking-[0.18em] text-white" style={{ gridTemplateColumns: tableColumns, minWidth: `${tableMinWidthPx}px`, width: `${tableMinWidthPx}px` }}>
                <div className="sticky left-0 z-30 border-b border-r border-slate-700 bg-slate-900 px-4 py-3 shadow-[inset_0_-1px_0_rgba(255,255,255,.04)] dark:bg-slate-950" style={{ width: `${firstColWidth}px` }}>
                  Cuadrilla
                </div>
                {weekDays.map((d) => {
                  const sunday = isSunday(d);
                  const holiday = feriados.includes(d);
                  return (
                    <div
                      key={`sticky_${d}`}
                      className={cls(
                        "border-b border-slate-700 px-2 py-3 text-center shadow-[inset_0_-1px_0_rgba(255,255,255,.04)]",
                        holiday ? "bg-sky-950" : sunday ? "bg-amber-950" : "bg-slate-900 dark:bg-slate-950"
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{formatLabel(d)}</span>
                        <div className="flex flex-wrap justify-center gap-1">
                          {sunday && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-100">Domingo</span>}
                          {holiday && <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] text-sky-100">Feriado</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="border-b border-slate-700 bg-slate-900 px-4 py-3 text-left shadow-[inset_0_-1px_0_rgba(255,255,255,.04)] dark:bg-slate-950" style={{ width: `${actionsColWidth}px` }}>
                  Acciones
                </div>
              </div>
            </div>
          </div>
        </div>
        <div ref={bodyScrollRef} className="relative overflow-x-auto overflow-y-visible">
          {cargando ? (
            <div className="space-y-3 p-5"><div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /></div>
          ) : (
          <table className="mx-auto table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: `${tableMinWidthPx}px`, width: `${tableMinWidthPx}px` }}>
            <colgroup>
              <col style={{ width: `${firstColWidth}px` }} />
              {weekDays.map((d) => (
                <col key={`col_${d}`} style={{ width: `${computedDayWidth}px` }} />
              ))}
              <col style={{ width: `${actionsColWidth}px` }} />
            </colgroup>
            <thead className="sr-only">
              <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-[0.18em] text-white dark:bg-slate-950">
                <th className="border-r border-slate-700 bg-slate-900 px-4 py-3 dark:bg-slate-950" style={{ width: `${firstColWidth}px` }}>Cuadrilla</th>
                {weekDays.map((d) => {
                  const sunday = isSunday(d);
                  const holiday = feriados.includes(d);
                  return (
                    <th
                      key={d}
                      className={cls(
                        "px-2 py-3 text-center",
                        holiday ? "bg-sky-950" : sunday ? "bg-amber-950" : "bg-slate-900 dark:bg-slate-950"
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{formatLabel(d)}</span>
                        <div className="flex flex-wrap justify-center gap-1">
                          {sunday && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] text-amber-100">Domingo</span>}
                          {holiday && <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] text-sky-100">Feriado</span>}
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="bg-slate-900 px-4 py-3 text-left dark:bg-slate-950" style={{ width: `${actionsColWidth}px` }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, idx) => {
                const dc = descansoCount(r.id);
                const ac = asistenciaCount(r.id);
                return (
                  <tr key={r.id} className={cls("border-b border-slate-200 dark:border-slate-700", idx % 2 ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-950")}>
                    <td
                      className={cls(
                        "sticky left-0 z-10 border-r border-slate-200 px-4 py-3 align-top dark:border-slate-700",
                        idx % 2 ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-950"
                      )}
                      style={{ width: `${firstColWidth}px` }}
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.nombre}</div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{r.coordinadorNombre || "-"}</div>
                    </td>
                      {weekDays.map((d) => {
                        const currentValue = String(items?.[r.id]?.[d] || "asistencia");
                        const cellMenuId = `${r.id}_${d}`;
                        const isMenuOpen = openCellMenu === cellMenuId;

                        const sunday = isSunday(d);
                        const holiday = feriados.includes(d);

                        return (
                          <td
                            key={`${r.id}_${d}`}
                            className={cls(
                              "px-2 py-2 text-center",
                              sunday ? "bg-amber-50/60 dark:bg-amber-950/20" : "",
                              holiday ? "bg-sky-50/60 dark:bg-sky-950/20" : ""
                            )}
                          >
                            <div className="relative" data-asistencia-cell-menu="true">
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => setOpenCellMenu((prev) => (prev === cellMenuId ? null : cellMenuId))}
                                className={cls(
                                  "mx-auto flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-2 text-left text-xs font-semibold shadow-sm transition",
                                  dc > 2 ? "border-rose-400 ring-1 ring-rose-200 dark:ring-rose-900/60" : "",
                                  estadoColor(currentValue),
                                  isLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                                )}
                              >
                                <span>{ESTADO_META[currentValue as keyof typeof ESTADO_META]?.label || currentValue}</span>
                                <span className="text-[10px] opacity-80">{isMenuOpen ? "▲" : "▼"}</span>
                              </button>

                              {isMenuOpen && !isLocked && (
                                <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[170px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
                                  <div className="max-h-64 overflow-auto p-1">
                                    {ESTADOS.map((e) => {
                                      const isActive = e === currentValue;
                                      return (
                                        <button
                                          key={e}
                                          type="button"
                                          onClick={() => {
                                            updateCell(r.id, d, e);
                                            setOpenCellMenu(null);
                                          }}
                                          className={cls(
                                            "mb-1 flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-xs font-semibold transition last:mb-0",
                                            estadoColor(e),
                                            isActive ? "ring-2 ring-offset-1 ring-[#254b87] dark:ring-sky-400 dark:ring-offset-slate-950" : ""
                                          )}
                                        >
                                          <span>{ESTADO_META[e as keyof typeof ESTADO_META]?.label || e}</span>
                                          <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                                            {ESTADO_META[e as keyof typeof ESTADO_META]?.short || e.slice(0, 2).toUpperCase()}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setRowAll(r.id, "asistencia")} disabled={isLocked} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">De Largo</button>
                        <div className="text-[11px] leading-4">
                          <div className="text-slate-500 dark:text-slate-400">Asistencias: {ac}</div>
                          <div className={cls(dc > 2 ? "text-rose-600" : "text-slate-500 dark:text-slate-400")}>Descansos: {dc}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={weekDays.length + 2}><EmptyState title="No hay cuadrillas para mostrar" description="Prueba cambiando la semana o limpiando los filtros actuales." /></td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        </div>
      </section>
    </div>
  );
}
