"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import { toast } from "sonner";
import * as XLSX from "xlsx";

dayjs.extend(customParseFormat);
dayjs.locale("es");

const ESTADOS = ["asistencia", "descanso"];

const ESTADO_META = {
  asistencia: { label: "Asistencia", short: "A" },
  descanso: { label: "Descanso", short: "D" },
} as const;

// DOW: 0=Dom 1=Lun 2=Mar 3=Mie 4=Jue 5=Vie 6=Sab
const COBERTURA_REGLAS: Record<number, {
  minAsistenciaPct: number;
  byCategoria?: { RESIDENCIAL?: number; MOTO?: number; OTRO?: "descanso" };
}> = {
  0: { minAsistenciaPct: 0, byCategoria: { RESIDENCIAL: 60, MOTO: 40, OTRO: "descanso" } },
  1: { minAsistenciaPct: 70 },
  2: { minAsistenciaPct: 85 },
  3: { minAsistenciaPct: 85 },
  4: { minAsistenciaPct: 85 },
  5: { minAsistenciaPct: 85 },
  6: { minAsistenciaPct: 97 },
};

// Cuadrillas extra que un coordinador puede acumular sobre su cuota justa de
// descanso antes de bloquear el guardado. Debe coincidir con TOLERANCIA_CUPO
// en domain/asistenciaProgramada/cobertura.ts (fuente de verdad backend).
const TOLERANCIA_CUPO = 1;

type CuotaInfo = { misDescansos: number; maxPermitido: number; estado: "ok" | "bad" | "none" };

function cupoYCuotaCoordinador(
  ymd: string,
  coordinadorUid: string,
  rows: Row[],
  items: Record<string, Record<string, string>>,
): CuotaInfo {
  if (!coordinadorUid) return { misDescansos: 0, maxPermitido: 0, estado: "none" };
  const dow = dayjs(ymd, "YYYY-MM-DD").day();
  const regla = COBERTURA_REGLAS[dow];
  if (!regla) return { misDescansos: 0, maxPermitido: 0, estado: "none" };

  const descansando = (r: Row) => String(items?.[r.id]?.[ymd] || "asistencia").toLowerCase() !== "asistencia";

  const evaluarPool = (pool: Row[], minPct: number): CuotaInfo => {
    const total = pool.length;
    const mios = pool.filter((r) => r.coordinadorUid === coordinadorUid);
    if (total === 0 || mios.length === 0) return { misDescansos: 0, maxPermitido: 0, estado: "none" };
    const cupoGlobalDescanso = total - Math.ceil((total * minPct) / 100);
    const cuotaJusta = cupoGlobalDescanso * (mios.length / total);
    const maxPermitido = Math.ceil(cuotaJusta) + TOLERANCIA_CUPO;
    const misDescansos = mios.filter(descansando).length;
    return { misDescansos, maxPermitido, estado: misDescansos > maxPermitido ? "bad" : "ok" };
  };

  if (regla.byCategoria && dow === 0) {
    const residencial = rows.filter((r) => categoriaCuadrilla(r) === "RESIDENCIAL");
    const moto = rows.filter((r) => categoriaCuadrilla(r) === "MOTO");
    const resResult = evaluarPool(residencial, regla.byCategoria.RESIDENCIAL ?? 0);
    const motoResult = evaluarPool(moto, regla.byCategoria.MOTO ?? 0);
    return {
      misDescansos: resResult.misDescansos + motoResult.misDescansos,
      maxPermitido: resResult.maxPermitido + motoResult.maxPermitido,
      estado: resResult.estado === "bad" || motoResult.estado === "bad" ? "bad" : resResult.estado === "none" && motoResult.estado === "none" ? "none" : "ok",
    };
  }

  return evaluarPool(rows, regla.minAsistenciaPct);
}

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

type Solicitud = {
  id: string;
  startYmd: string;
  dia: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  estadoActual: string;
  estadoSolicitado: string;
  solicitanteUid: string;
  solicitanteNombre: string;
  propietarioUid: string;
  propietarioNombre: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "CANCELADA";
  mensaje?: string;
  resolvedAt?: string;
  resolvedByNombre?: string;
  resolutionComment?: string;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  startYmd: string;
  endYmd: string;
  estado: string;
  items: Record<string, Record<string, string>>;
  feriados?: string[];
  openUntil?: string;
  edicionCoordinadores?: "ABIERTA" | "PAUSADA";
  cuadrillas: Row[];
  coordinadoresEstado?: CoordinadorEstado[];
  myCoordinatorStatus?: "SIN_INICIAR" | "BORRADOR" | "CONFIRMADO";
  myCoordinatorUid?: string;
  canEdit: boolean;
  canConfirm?: boolean;
  canAdmin?: boolean;
};

type CoberturaEstado = "ok" | "warn" | "bad" | "none";
type CoberturaInfo = {
  estado: CoberturaEstado;
  pct: number;
  minPct: number;
  // Domingo diferenciado
  residencial?: { pct: number; minPct: number; estado: CoberturaEstado };
  moto?: { pct: number; minPct: number; estado: CoberturaEstado };
};

function categoriaCuadrilla(row: Row): "RESIDENCIAL" | "MOTO" | "OTRO" {
  const cat = String(row.categoria || "").toUpperCase();
  const veh = String(row.vehiculo || "").toUpperCase();
  const nom = String(row.nombre || "").toUpperCase();
  if (cat === "RESIDENCIAL" || nom.includes("RESIDENCIAL")) return "RESIDENCIAL";
  if (cat === "CONDOMINIO" || veh === "MOTO" || nom.includes("MOTO")) return "MOTO";
  return "OTRO";
}

function coberturaDelDia(
  ymd: string,
  rows: Row[],
  items: Record<string, Record<string, string>>
): CoberturaInfo {
  if (rows.length === 0) return { estado: "none", pct: 0, minPct: 0 };
  const dow = dayjs(ymd, "YYYY-MM-DD").day();
  const regla = COBERTURA_REGLAS[dow];
  if (!regla) return { estado: "none", pct: 0, minPct: 0 };

  const asistencia = (r: Row) =>
    String(items?.[r.id]?.[ymd] || "asistencia").toLowerCase() === "asistencia";

  if (regla.byCategoria && dow === 0) {
    const residencial = rows.filter((r) => categoriaCuadrilla(r) === "RESIDENCIAL");
    const moto = rows.filter((r) => categoriaCuadrilla(r) === "MOTO");
    const total = rows.length;
    const totalAsistencia = rows.filter(asistencia).length;
    const pctTotal = total > 0 ? Math.round((totalAsistencia / total) * 100) : 0;

    const resPct = residencial.length > 0
      ? Math.round((residencial.filter(asistencia).length / residencial.length) * 100)
      : 100;
    const motoPct = moto.length > 0
      ? Math.round((moto.filter(asistencia).length / moto.length) * 100)
      : 100;

    const resMin = regla.byCategoria.RESIDENCIAL ?? 0;
    const motoMin = regla.byCategoria.MOTO ?? 0;

    const resEstado: CoberturaEstado = residencial.length === 0 ? "none" : resPct >= resMin ? "ok" : resPct >= resMin - 10 ? "warn" : "bad";
    const motoEstado: CoberturaEstado = moto.length === 0 ? "none" : motoPct >= motoMin ? "ok" : motoPct >= motoMin - 10 ? "warn" : "bad";
    const globalEstado: CoberturaEstado =
      resEstado === "bad" || motoEstado === "bad" ? "bad" :
      resEstado === "warn" || motoEstado === "warn" ? "warn" : "ok";

    return {
      estado: globalEstado,
      pct: pctTotal,
      minPct: 0,
      residencial: { pct: resPct, minPct: resMin, estado: resEstado },
      moto: { pct: motoPct, minPct: motoMin, estado: motoEstado },
    };
  }

  const count = rows.filter(asistencia).length;
  const pct = Math.round((count / rows.length) * 100);
  const minPct = regla.minAsistenciaPct;
  const estado: CoberturaEstado = pct >= minPct ? "ok" : pct >= minPct - 10 ? "warn" : "bad";
  return { estado, pct, minPct };
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractNumCuadrilla(row: Row): number | null {
  if (row.numeroCuadrilla && row.numeroCuadrilla > 0) return row.numeroCuadrilla;
  const match = String(row.nombre || "").match(/K\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Descansos acumulados de semanas previas del mismo mes calendario, usado
// por autoGenerar() para rotar equitativamente en vez de sortear cada
// semana de forma independiente (evita que una cuadrilla caiga varios
// domingos seguidos por mala suerte).
type HistorialMes = Record<string, { domingosDescansados: number; totalDescansos: number }>;

// Mezcla aleatoriamente (para desempatar) y luego ordena ascendente por la
// clave dada — prioriza a quien menos ha descansado, sin perder aleatoriedad
// entre cuadrillas empatadas.
function ordenarPorEquidad<T>(lista: T[], claveFn: (item: T) => number): T[] {
  return shuffleArray(lista).sort((a, b) => claveFn(a) - claveFn(b));
}

function autoGenerar(
  rows: Row[],
  weekDays: string[],
  historial: HistorialMes = {},
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  rows.forEach((r) => {
    result[r.id] = {};
    weekDays.forEach((d) => { result[r.id][d] = "asistencia"; });
  });

  const descansosPorRow: Record<string, number> = {};
  rows.forEach((r) => { descansosPorRow[r.id] = 0; });

  const cupoDescanso: Record<string, number> = {};
  const usadoDescanso: Record<string, number> = {};
  weekDays.forEach((d) => { usadoDescanso[d] = 0; });

  weekDays.forEach((d) => {
    const dow = dayjs(d, "YYYY-MM-DD").day();
    const regla = COBERTURA_REGLAS[dow];
    if (!regla) { cupoDescanso[d] = 0; return; }
    if (dow === 0) {
      const nRes = rows.filter((r) => categoriaCuadrilla(r) === "RESIDENCIAL").length;
      const nMoto = rows.filter((r) => categoriaCuadrilla(r) === "MOTO").length;
      const nOtro = rows.filter((r) => categoriaCuadrilla(r) === "OTRO").length;
      cupoDescanso[d] = Math.floor(nRes * 0.40) + Math.floor(nMoto * 0.60) + nOtro;
    } else {
      cupoDescanso[d] = Math.floor(rows.length * ((100 - regla.minAsistenciaPct) / 100));
    }
  });

  const asignar = (r: Row, d: string) => {
    result[r.id][d] = "descanso";
    descansosPorRow[r.id]++;
    usadoDescanso[d]++;
  };

  const diasSemana = weekDays.filter((d) => dayjs(d, "YYYY-MM-DD").day() !== 0);
  const lunes = diasSemana.find((d) => dayjs(d, "YYYY-MM-DD").day() === 1);
  const otrosDiasSemana = shuffleArray(diasSemana.filter((d) => d !== lunes));
  const diasOrdenados = lunes ? [lunes, ...otrosDiasSemana] : otrosDiasSemana;

  // Días ordenados de más a menos permisivo (para fallback cuando cupo está lleno)
  const diasPorPermisividad = [...weekDays].sort((a, b) => {
    const maxA = 100 - (COBERTURA_REGLAS[dayjs(a, "YYYY-MM-DD").day()]?.minAsistenciaPct ?? 100);
    const maxB = 100 - (COBERTURA_REGLAS[dayjs(b, "YYYY-MM-DD").day()]?.minAsistenciaPct ?? 100);
    return maxB - maxA;
  });

  // PASO 1A — Domingo con reglas por categoría
  // Prioriza (con desempate aleatorio) a quien menos domingos ha descansado
  // en el mes, para rotar el "domingo duro" en vez de sortearlo cada semana
  // de forma independiente.
  const domingo = weekDays.find((d) => dayjs(d, "YYYY-MM-DD").day() === 0);
  if (domingo) {
    rows.filter((r) => categoriaCuadrilla(r) === "OTRO").forEach((r) => asignar(r, domingo));
    const residenciales = ordenarPorEquidad(
      rows.filter((r) => categoriaCuadrilla(r) === "RESIDENCIAL"),
      (r) => historial[r.id]?.domingosDescansados ?? 0,
    );
    residenciales.slice(0, Math.floor(residenciales.length * 0.40)).forEach((r) => asignar(r, domingo));
    const motos = ordenarPorEquidad(
      rows.filter((r) => categoriaCuadrilla(r) === "MOTO"),
      (r) => historial[r.id]?.domingosDescansados ?? 0,
    );
    motos.slice(0, Math.floor(motos.length * 0.60)).forEach((r) => asignar(r, domingo));
  }

  // PASO 1B — Primer descanso para cuadrillas que aún no tienen ninguno
  // Solo se consideran cuadrillas con 0 descansos, garantizando equidad antes del 2do descanso.
  // Entre las candidatas, prioriza a quien acumula menos descansos en el mes.
  diasOrdenados.forEach((d) => {
    const cupoDisp = cupoDescanso[d] - usadoDescanso[d];
    if (cupoDisp <= 0) return;
    const sinDescanso = ordenarPorEquidad(
      rows.filter((r) => descansosPorRow[r.id] === 0),
      (r) => historial[r.id]?.totalDescansos ?? 0,
    );
    sinDescanso.slice(0, cupoDisp).forEach((r) => asignar(r, d));
  });

  // PASO 1C — Forzar 1er descanso a las que aún no tienen (cupo agotado en todos los días)
  rows.filter((r) => descansosPorRow[r.id] === 0).forEach((r) => {
    for (const d of diasPorPermisividad) {
      if (cupoDescanso[d] - usadoDescanso[d] > 0) {
        asignar(r, d);
        return;
      }
    }
    if (diasPorPermisividad[0]) asignar(r, diasPorPermisividad[0]);
  });

  // PASO 2 — Distribuir 2do descanso equitativamente
  // En este punto todas las cuadrillas tienen exactamente 1 descanso.
  // Se procesa primero a quien acumula menos descansos totales en el mes
  // (historial + lo ya asignado esta semana), con desempate aleatorio.
  ordenarPorEquidad(rows, (r) => (historial[r.id]?.totalDescansos ?? 0) + descansosPorRow[r.id]).forEach((r) => {
    if (descansosPorRow[r.id] >= 2) return;
    // Elegir aleatoriamente entre días disponibles con cupo y sin descanso previo
    const candidatos = shuffleArray(
      diasOrdenados.filter((d) => result[r.id][d] !== "descanso" && cupoDescanso[d] - usadoDescanso[d] > 0)
    );
    if (candidatos.length > 0) asignar(r, candidatos[0]);
  });

  return result;
}

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

function currentWeekThursdayYmd() {
  const today = dayjs();
  const dow = today.day(); // 0=Dom … 4=Jue … 6=Sab
  const daysSince = (dow - 4 + 7) % 7;
  return today.subtract(daysSince, "day").format("YYYY-MM-DD");
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

function CoberturaBar({ pct, minPct, estado }: { pct: number; minPct: number; estado: CoberturaEstado }) {
  const colorBar =
    estado === "ok" ? "bg-emerald-500" :
    estado === "warn" ? "bg-amber-400" :
    estado === "bad" ? "bg-rose-500" :
    "bg-slate-400";
  const colorText =
    estado === "ok" ? "text-emerald-700 dark:text-emerald-300" :
    estado === "warn" ? "text-amber-700 dark:text-amber-300" :
    estado === "bad" ? "text-rose-700 dark:text-rose-300" :
    "text-slate-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={cls("h-1.5 rounded-full transition-all", colorBar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={cls("text-[11px] font-semibold tabular-nums", colorText)}>{pct}%</span>
      {minPct > 0 && <span className="text-[10px] text-slate-400 dark:text-slate-500">/{minPct}%</span>}
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

function CoberturaIcon({ estado }: { estado: CoberturaEstado }) {
  if (estado === "ok") return <span className="text-emerald-500">✓</span>;
  if (estado === "warn") return <span className="text-amber-500">!</span>;
  if (estado === "bad") return <span className="text-rose-500">✕</span>;
  return null;
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
  const [edicionCoordinadores, setEdicionCoordinadores] = useState<"ABIERTA" | "PAUSADA">("ABIERTA");
  const [canAdmin, setCanAdmin] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [myCoordinatorStatus, setMyCoordinatorStatus] = useState<"SIN_INICIAR" | "BORRADOR" | "CONFIRMADO">("SIN_INICIAR");
  const [myCoordinatorUid, setMyCoordinatorUid] = useState("");
  const [coordinadoresEstado, setCoordinadoresEstado] = useState<CoordinadorEstado[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [solicitudModal, setSolicitudModal] = useState<{ row: Row } | null>(null);
  const [modalDia, setModalDia] = useState("");
  const [modalEstado, setModalEstado] = useState("asistencia");
  const [modalMensaje, setModalMensaje] = useState("");
  const [modalEnviando, setModalEnviando] = useState(false);
  const [contador, setContador] = useState("");
  const [openCellMenu, setOpenCellMenu] = useState<string | null>(null);
  const [plantillaBuffer, setPlantillaBuffer] = useState<ArrayBuffer | null>(null);
  const [plantillaNombre, setPlantillaNombre] = useState<string>("");
  const plantillaInputRef = useRef<HTMLInputElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const tableAreaRef = useRef<HTMLDivElement | null>(null);
  const [tableAreaWidth, setTableAreaWidth] = useState(0);

  const weekDays = useMemo(() => toWeekDays(startYmd), [startYmd]);
  // Coordinadores no pueden editar días que ya pasaron (solo Gerencia/Jefatura/Admin corrigen historial)
  const todayYmd = dayjs().format("YYYY-MM-DD");
  const isPastDay = (d: string) => d < todayYmd;

  const cargar = async (requestedStartYmd?: string) => {
    setCargando(true);
    try {
      const query = requestedStartYmd ? `?start=${encodeURIComponent(requestedStartYmd)}` : "";
      const res = await fetch(`/api/instalaciones/asistencia-programada${query}`, { cache: "no-store" });
      const data: ApiResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");
      const resolvedStartYmd = String(data.startYmd || requestedStartYmd || currentWeekThursdayYmd()).trim();
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
      setEdicionCoordinadores(data.edicionCoordinadores === "PAUSADA" ? "PAUSADA" : "ABIERTA");
      setCanEdit(!!data.canEdit);
      setCanAdmin(!!data.canAdmin);
      setCanConfirm(!!data.canConfirm);
      setMyCoordinatorStatus(data.myCoordinatorStatus || "SIN_INICIAR");
      setMyCoordinatorUid(String(data.myCoordinatorUid || ""));
      setCoordinadoresEstado(Array.isArray(data.coordinadoresEstado) ? data.coordinadoresEstado : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar la programacion");
    } finally {
      setCargando(false);
    }
  };

  const cargarSolicitudes = async () => {
    if (!startYmd) return;
    try {
      const res = await fetch(
        `/api/instalaciones/asistencia-programada/solicitudes?startYmd=${encodeURIComponent(startYmd)}`,
      );
      const data = await res.json();
      if (data.ok) setSolicitudes(data.solicitudes || []);
    } catch {}
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

  useEffect(() => {
    if (startYmd) cargarSolicitudes();
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
    const rowsAValidar = (!canAdmin && myCoordinatorUid)
      ? rows.filter((r) => r.coordinadorUid === myCoordinatorUid)
      : rows;
    for (const r of rowsAValidar) {
      const c = descansoCount(r.id);
      if (c > maxDesc) return { ok: false, msg: `La cuadrilla ${r.nombre} tiene ${c} descansos. Máximo ${maxDesc}.` };
    }

    // Coordinadores no pueden guardar si algún día no cumple el % mínimo de cobertura
    if (!canAdmin && myCoordinatorUid) {
      const dayNames: Record<number, string> = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
      for (const d of weekDays) {
        const cob = coberturaByDay[d];
        if (!cob || cob.estado === "none") continue;
        if (cob.estado !== "bad") continue;
        const dow = dayjs(d, "YYYY-MM-DD").day();
        const dayName = dayNames[dow] || formatLabel(d);
        if (dow === 0) {
          if (cob.residencial?.estado === "bad")
            return { ok: false, msg: `${dayName}: Residencial con ${cob.residencial.pct}% de asistencia (mínimo ${cob.residencial.minPct}%). Ajusta los descansos antes de guardar.` };
          if (cob.moto?.estado === "bad")
            return { ok: false, msg: `${dayName}: Moto con ${cob.moto.pct}% de asistencia (mínimo ${cob.moto.minPct}%). Ajusta los descansos antes de guardar.` };
        } else {
          return { ok: false, msg: `${dayName} (${formatLabel(d)}): ${cob.pct}% de asistencia (mínimo requerido ${cob.minPct}%). Ajusta los descansos antes de guardar.` };
        }
      }
    }

    // Coordinadores no pueden acaparar el cupo de descanso del día por encima de su cuota justa
    if (!canAdmin && myCoordinatorUid) {
      const dayNames: Record<number, string> = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
      for (const d of weekDays) {
        const cuota = cuotaByCoordinadorDay[d];
        if (!cuota || cuota.estado !== "bad") continue;
        const dayName = dayNames[dayjs(d, "YYYY-MM-DD").day()] || formatLabel(d);
        return {
          ok: false,
          msg: `${dayName}: tienes ${cuota.misDescansos} cuadrilla(s) en descanso (cuota equitativa: ${cuota.maxPermitido}, según tu proporción de cuadrillas). Ajusta antes de guardar.`,
        };
      }
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

  // Reconstruye cuántos descansos (y domingos de descanso) acumula cada
  // cuadrilla en las semanas previas ya guardadas del mismo mes calendario,
  // para que autoGenerar() rote equitativamente en vez de sortear cada
  // semana de forma independiente.
  const cargarHistorialMes = async (targetStartYmd: string): Promise<HistorialMes> => {
    const historial: HistorialMes = {};
    const mesObjetivo = dayjs(targetStartYmd).month();
    let cursor = dayjs(targetStartYmd).subtract(7, "day");
    for (let i = 0; i < 5 && cursor.month() === mesObjetivo; i++) {
      const cursorYmd = cursor.format("YYYY-MM-DD");
      try {
        const res = await fetch(`/api/instalaciones/asistencia-programada?start=${encodeURIComponent(cursorYmd)}`, { cache: "no-store" });
        const data: ApiResponse = await res.json();
        if (res.ok && data?.ok) {
          const semanaDias = toWeekDays(cursorYmd);
          const semanaDomingo = semanaDias.find((d) => dayjs(d, "YYYY-MM-DD").day() === 0);
          Object.entries(data.items || {}).forEach(([cid, dias]) => {
            const entry = historial[cid] || { domingosDescansados: 0, totalDescansos: 0 };
            semanaDias.forEach((d) => {
              if (String(dias?.[d] || "asistencia").toLowerCase() === "descanso") {
                entry.totalDescansos++;
                if (d === semanaDomingo) entry.domingosDescansados++;
              }
            });
            historial[cid] = entry;
          });
        }
      } catch {
        // Semana no disponible o error de red: se ignora, el rotador sigue con lo que tenga.
      }
      cursor = cursor.subtract(7, "day");
    }
    return historial;
  };

  const handleAutoGenerar = () => {
    if (rows.length === 0) return;
    toast("Generar programacion automatica?", {
      description: "Se sobreescribira la grilla actual con una distribucion que respeta los porcentajes requeridos y rota equitativamente los descansos del mes.",
      action: {
        label: "Generar",
        onClick: async () => {
          const historial = await cargarHistorialMes(startYmd);
          const generated = autoGenerar(rows, weekDays, historial);
          setItems(generated);
          toast.success("Programacion generada. Revisa y guarda cuando este lista.");
        },
      },
      cancel: {
        label: "Cancelar",
        onClick: () => {},
      },
    });
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

  // Pausa/reanuda solo la edición de coordinadores, sin cerrar la semana —
  // para que Gerencia pueda revisar sin cerrar toda la semana (que bloquearía
  // también otras herramientas de admin) ni esperar a que nadie edite.
  const pausarEdicionCoordinadores = async (next: "ABIERTA" | "PAUSADA") => {
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada/edicion-coordinadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startYmd, edicionCoordinadores: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      toast.success(next === "PAUSADA" ? "Edición de coordinadores pausada" : "Edición de coordinadores reanudada");
      await cargar(startYmd);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar la edición de coordinadores");
    }
  };

  const confirmarPausarEdicion = () => {
    toast("Pausar edición de coordinadores?", {
      description: "La semana seguirá abierta, pero los coordinadores no podrán editar ni confirmar hasta que reanudes. Útil para revisar antes de que sigan haciendo cambios.",
      action: {
        label: "Pausar",
        onClick: () => pausarEdicionCoordinadores("PAUSADA"),
      },
      cancel: {
        label: "Cancelar",
        onClick: () => {},
      },
    });
  };

  const confirmarReanudarEdicion = () => {
    toast("Reanudar edición de coordinadores?", {
      description: "Los coordinadores podrán volver a editar y confirmar su programación.",
      action: {
        label: "Reanudar",
        onClick: () => pausarEdicionCoordinadores("ABIERTA"),
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

  // Cobertura por día (sobre todas las rows, no solo visibles)
  const coberturaByDay = useMemo(() => {
    const map: Record<string, CoberturaInfo> = {};
    weekDays.forEach((d) => {
      map[d] = coberturaDelDia(d, rows, items);
    });
    return map;
  }, [weekDays, rows, items]);

  const coberturaResumen = useMemo(() => {
    const dias = weekDays.map((d) => {
      const dow = dayjs(d, "YYYY-MM-DD").day();
      const dayNames: Record<number, string> = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miercoles", 4: "Jueves", 5: "Viernes", 6: "Sabado" };
      return { ymd: d, dow, label: dayNames[dow] || d, info: coberturaByDay[d] };
    });
    return dias;
  }, [weekDays, coberturaByDay]);

  // Cuota equitativa de descanso del coordinador logueado, por día de la semana
  const cuotaByCoordinadorDay = useMemo(() => {
    const map: Record<string, CuotaInfo> = {};
    if (!myCoordinatorUid) return map;
    weekDays.forEach((d) => {
      map[d] = cupoYCuotaCoordinador(d, myCoordinatorUid, rows, items);
    });
    return map;
  }, [weekDays, rows, items, myCoordinatorUid]);

  const pendingByCell = useMemo(() => {
    const map = new Map<string, Solicitud>();
    solicitudes
      .filter((s) => s.estado === "PENDIENTE")
      .forEach((s) => map.set(`${s.cuadrillaId}_${s.dia}`, s));
    return map;
  }, [solicitudes]);

  const solicitudesRecibidas = useMemo(
    () =>
      canAdmin
        ? solicitudes.filter((s) => s.estado === "PENDIENTE")
        : solicitudes.filter((s) => s.propietarioUid === myCoordinatorUid && s.estado === "PENDIENTE"),
    [solicitudes, myCoordinatorUid, canAdmin],
  );

  const solicitudesEnviadas = useMemo(
    () => (canAdmin ? [] : solicitudes.filter((s) => s.solicitanteUid === myCoordinatorUid)),
    [solicitudes, myCoordinatorUid, canAdmin],
  );

  // Categorías de las cuadrillas propias del coordinador logueado
  const myCategories = useMemo(() => {
    if (!myCoordinatorUid) return new Set<string>();
    return new Set(
      rows
        .filter((r) => r.coordinadorUid === myCoordinatorUid)
        .map((r) => categoriaCuadrilla(r)),
    );
  }, [rows, myCoordinatorUid]);

  const abrirModalSolicitud = (row: Row) => {
    const defaultDia = weekDays[0] || "";
    setSolicitudModal({ row });
    setModalDia(defaultDia);
    const estadoActual = defaultDia
      ? String(items?.[row.id]?.[defaultDia] || "asistencia")
      : "asistencia";
    setModalEstado(estadoActual === "asistencia" ? "descanso" : "asistencia");
    setModalMensaje("");
  };

  const enviarSolicitud = async () => {
    if (!solicitudModal || !modalDia) return;
    setModalEnviando(true);
    try {
      const res = await fetch("/api/instalaciones/asistencia-programada/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startYmd,
          dia: modalDia,
          cuadrillaId: solicitudModal.row.id,
          estadoSolicitado: modalEstado,
          mensaje: modalMensaje,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || "ERROR");
      toast.success("Solicitud enviada al coordinador responsable");
      setSolicitudModal(null);
      await cargarSolicitudes();
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg === "COBERTURA_INSUFICIENTE") toast.error("El cambio viola el % mínimo de cobertura para ese día");
      else if (msg === "YA_EXISTE_PENDIENTE") toast.error("Ya hay una solicitud pendiente para ese día");
      else if (msg === "SEMANA_CERRADA") toast.error("La semana está cerrada");
      else if (msg === "ES_CUADRILLA_PROPIA") toast.error("No puedes solicitar cambio en tus propias cuadrillas");
      else if (msg === "MISMO_ESTADO") toast.error("El estado solicitado es igual al actual");
      else toast.error(msg || "No se pudo enviar la solicitud");
    } finally {
      setModalEnviando(false);
    }
  };

  const responderSolicitud = async (id: string, accion: "ACEPTAR" | "RECHAZAR") => {
    try {
      const res = await fetch(
        `/api/instalaciones/asistencia-programada/solicitudes/${id}/responder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.reason || data.error || "ERROR");
      toast.success(
        accion === "ACEPTAR" ? "Solicitud aprobada — cambio aplicado" : "Solicitud rechazada",
      );
      await Promise.all([cargar(startYmd), cargarSolicitudes()]);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.startsWith("Cobertura"))
        toast.error(msg);
      else if (msg === "COBERTURA_INSUFICIENTE")
        toast.error("No se puede aprobar: viola el % mínimo de cobertura para ese día");
      else if (msg === "SEMANA_CERRADA")
        toast.error("La semana está cerrada y no se pueden aplicar cambios");
      else
        toast.error(msg || "No se pudo procesar la solicitud");
    }
  };

  const estadoColor = (v: string) => {
    switch (String(v || "").toLowerCase()) {
      case "asistencia":
        return "bg-emerald-100 border-emerald-300 text-green-700 dark:bg-green-950 dark:border-green-500 dark:text-green-200 dark:ring-1 dark:ring-green-500/40";
      case "descanso":
        return "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-500 dark:text-amber-200 dark:ring-1 dark:ring-amber-500/40";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-500 dark:text-slate-200";
    }
  };

  const handlePlantillaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result;
      if (buf instanceof ArrayBuffer) {
        setPlantillaBuffer(buf);
        setPlantillaNombre(file.name);
        toast.success(`Plantilla cargada: ${file.name}`);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input para poder volver a subir el mismo archivo si es necesario
    e.target.value = "";
  };

  // DOW → índice de columna en la plantilla (0-based): D=LU=3, E=MA=4, F=MI=5, G=JU=6, H=VI=7, I=SA=8, J=DO=9
  const DOW_TO_COL: Record<number, number> = { 0: 9, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8 };

  const exportarExcelDetalle = () => {
    try {
      if (rows.length === 0 || weekDays.length === 0) throw new Error("No hay datos para exportar.");

      const dayShort: Record<number, string> = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" };
      const dayFull: Record<number, string> = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
      const semanaLabel = `${weekDays[0]} al ${weekDays[weekDays.length - 1]}`;

      const wb = XLSX.utils.book_new();

      // ── HOJA 1: Resumen por Día ─────────────────────────────────────────
      // Vista ejecutiva: por cada día cuántas cuadrillas salen, % asistencia y estado de cobertura
      const resumenData: (string | number)[][] = [
        [`Asistencia Programada — Semana ${semanaLabel}`],
        [],
        ["Día", "Fecha", "Total Cuadrillas", "Salen (Asistencia)", "Descanso", "% Asistencia", "% Descanso", "Meta %", "Estado Cobertura", "% Residencial (Dom)", "% Moto (Dom)"],
      ];
      weekDays.forEach((d) => {
        const dow = dayjs(d, "YYYY-MM-DD").day();
        const cob = coberturaByDay[d];
        const salen = rows.filter((r) =>
          String(items?.[r.id]?.[d] || "asistencia").toLowerCase() === "asistencia"
        ).length;
        const descanso = rows.length - salen;
        const pctAsistencia = rows.length > 0 ? Math.round((salen / rows.length) * 100) : 0;
        const estadoLabel =
          cob.estado === "ok" ? "Cumple" :
          cob.estado === "warn" ? "Cerca del limite" :
          cob.estado === "bad" ? "Bajo el minimo" : "-";
        const feriado = feriados.includes(d);
        resumenData.push([
          `${dayFull[dow] || d}${feriado ? " (Feriado)" : ""}`,
          d,
          rows.length,
          salen,
          descanso,
          pctAsistencia / 100,
          (100 - pctAsistencia) / 100,
          cob.minPct ? cob.minPct / 100 : "-",
          estadoLabel,
          dow === 0 && cob.residencial ? cob.residencial.pct / 100 : "",
          dow === 0 && cob.moto ? cob.moto.pct / 100 : "",
        ]);
      });
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
      // Marcar columnas de porcentaje como formato %
      const pctCols = [5, 6, 7, 9, 10];
      for (let r = 3; r < resumenData.length; r++) {
        pctCols.forEach((c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (wsResumen[addr] && typeof wsResumen[addr].v === "number") {
            wsResumen[addr].t = "n";
            wsResumen[addr].z = "0%";
          }
        });
      }
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen por Dia");

      // ── HOJA 2: Por Coordinador ─────────────────────────────────────────
      // Cuántas cuadrillas de cada coordinador salen cada día
      const coordData: (string | number)[][] = [
        ["Coordinador", "Dia", "Fecha", "Sus Cuadrillas", "Salen", "Descanso", "% Asistencia"],
      ];
      coordinadoresUnicos.forEach(({ uid, nombre }) => {
        const suyas = rows.filter((r) => r.coordinadorUid === uid);
        weekDays.forEach((d) => {
          const dow = dayjs(d, "YYYY-MM-DD").day();
          const salen = suyas.filter((r) =>
            String(items?.[r.id]?.[d] || "asistencia").toLowerCase() === "asistencia"
          ).length;
          const descanso = suyas.length - salen;
          const pct = suyas.length > 0 ? salen / suyas.length : 0;
          coordData.push([nombre, dayFull[dow] || d, d, suyas.length, salen, descanso, pct]);
        });
      });
      const wsCoord = XLSX.utils.aoa_to_sheet(coordData);
      for (let r = 1; r < coordData.length; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: 6 });
        if (wsCoord[addr] && typeof wsCoord[addr].v === "number") {
          wsCoord[addr].t = "n";
          wsCoord[addr].z = "0%";
        }
      }
      XLSX.utils.book_append_sheet(wb, wsCoord, "Por Coordinador");

      // ── HOJA 3: Grilla Cuadrillas ───────────────────────────────────────
      // Cuadrilla como filas, días como columnas (A = Asistencia, D = Descanso)
      const grillaHeader: (string | number)[] = ["Cuadrilla", "N°", "Categoria", "Coordinador"];
      weekDays.forEach((d) => {
        const dow = dayjs(d, "YYYY-MM-DD").day();
        grillaHeader.push(`${dayShort[dow] || d} ${dayjs(d, "YYYY-MM-DD").format("DD/MM")}`);
      });
      grillaHeader.push("Dias Asistencia", "Dias Descanso");
      const grillaData: (string | number)[][] = [grillaHeader];

      [...rows].sort((a, b) => {
        const gDiff = cuadrillaGroupOrder(a) - cuadrillaGroupOrder(b);
        if (gDiff !== 0) return gDiff;
        return (a.numeroCuadrilla || 0) - (b.numeroCuadrilla || 0);
      }).forEach((r) => {
        const num = extractNumCuadrilla(r);
        const cat = categoriaCuadrilla(r);
        const fila: (string | number)[] = [
          r.nombre,
          num ?? "",
          cat === "RESIDENCIAL" ? "Residencial" : cat === "MOTO" ? "Moto" : "Otro",
          r.coordinadorNombre || "-",
        ];
        let totalA = 0;
        let totalD = 0;
        weekDays.forEach((d) => {
          const estado = String(items?.[r.id]?.[d] || "asistencia").toLowerCase();
          fila.push(estado === "asistencia" ? "A" : "D");
          if (estado === "asistencia") totalA++; else totalD++;
        });
        fila.push(totalA, totalD);
        grillaData.push(fila);
      });

      // Fila de totales por día al pie
      const totalFila: (string | number)[] = ["TOTAL SALEN", "", "", ""];
      weekDays.forEach((d) => {
        totalFila.push(
          rows.filter((r) => String(items?.[r.id]?.[d] || "asistencia").toLowerCase() === "asistencia").length
        );
      });
      totalFila.push("", "");
      const pctFila: (string | number)[] = ["% ASISTENCIA", "", "", ""];
      weekDays.forEach((d) => {
        const salen = rows.filter((r) => String(items?.[r.id]?.[d] || "asistencia").toLowerCase() === "asistencia").length;
        pctFila.push(rows.length > 0 ? salen / rows.length : 0);
      });
      pctFila.push("", "");
      grillaData.push([]);
      grillaData.push(totalFila);
      grillaData.push(pctFila);

      const wsGrilla = XLSX.utils.aoa_to_sheet(grillaData);
      // Formato % en la fila de porcentajes
      const pctRowIdx = grillaData.length - 1;
      weekDays.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r: pctRowIdx, c: 4 + ci });
        if (wsGrilla[addr] && typeof wsGrilla[addr].v === "number") {
          wsGrilla[addr].t = "n";
          wsGrilla[addr].z = "0%";
        }
      });
      XLSX.utils.book_append_sheet(wb, wsGrilla, "Grilla Cuadrillas");

      // ── HOJA 4: Datos planos ────────────────────────────────────────────
      // Tabla plana para que Gerencia pueda crear su propia tabla dinámica
      const datosData: (string | number)[][] = [
        ["Semana", "Fecha", "Dia", "Coordinador", "Cuadrilla", "N° Cuadrilla", "Categoria", "Estado", "Asiste (1/0)"],
      ];
      rows.forEach((r) => {
        const num = extractNumCuadrilla(r);
        const cat = categoriaCuadrilla(r);
        weekDays.forEach((d) => {
          const dow = dayjs(d, "YYYY-MM-DD").day();
          const estado = String(items?.[r.id]?.[d] || "asistencia").toLowerCase();
          datosData.push([
            semanaLabel,
            d,
            dayFull[dow] || d,
            r.coordinadorNombre || "-",
            r.nombre,
            num ?? "",
            cat === "RESIDENCIAL" ? "Residencial" : cat === "MOTO" ? "Moto" : "Otro",
            estado === "asistencia" ? "Asistencia" : "Descanso",
            estado === "asistencia" ? 1 : 0,
          ]);
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datosData), "Datos");

      XLSX.writeFile(wb, `asistencia_detalle_${startYmd}_a_${endYmd}.xlsx`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo exportar el detalle");
    }
  };

  const exportarExcel = async () => {
    try {
      // 1. Requiere plantilla subida por el usuario
      if (!plantillaBuffer) throw new Error("Sube una plantilla .xlsx antes de exportar.");
      const buffer = plantillaBuffer;
      const wb = XLSX.read(buffer, { type: "array", cellStyles: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:K1");

      // 2. Construir índice: clave WIN ("K 2 MOTOWIN" / "K 1 M&D") → fila
      const lookup = new Map<string, number>();
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
        if (!cellB) continue;
        const nombre = String(cellB.v || "");
        // Extraer prefijo: "K N MOTOWIN" o "K N M&D"
        const moto = nombre.match(/^(K\s+\d+\s+MOTOWIN)/i);
        const residencial = nombre.match(/^(K\s+\d+\s+M&D)/i);
        if (moto) lookup.set(moto[1].toUpperCase().replace(/\s+/g, " "), r);
        else if (residencial) lookup.set(residencial[1].toUpperCase().replace(/\s+/g, " "), r);
      }

      // 3. Actualizar celdas D-J (LU-DO) para cada cuadrilla visible
      let noEncontradas: string[] = [];
      rows.forEach((r) => {
        const num = extractNumCuadrilla(r);
        if (!num) return;
        const cat = categoriaCuadrilla(r);
        const clave = cat === "MOTO" ? `K ${num} MOTOWIN` : `K ${num} M&D`;
        const rowIdx = lookup.get(clave.toUpperCase());
        if (rowIdx === undefined) {
          noEncontradas.push(r.nombre);
          return;
        }
        weekDays.forEach((d) => {
          const dow = dayjs(d, "YYYY-MM-DD").day();
          const col = DOW_TO_COL[dow];
          if (col === undefined) return;
          const addr = XLSX.utils.encode_cell({ r: rowIdx, c: col });
          const val = String(items?.[r.id]?.[d] || "asistencia").toLowerCase();
          const excelVal = val === "descanso" ? "N" : "S";
          if (!ws[addr]) ws[addr] = { t: "s", v: excelVal };
          else { ws[addr].v = excelVal; ws[addr].t = "s"; delete ws[addr].w; }
        });
      });

      // 4. Descargar
      XLSX.writeFile(wb, `asistencia_programada_${startYmd}_a_${endYmd}.xlsx`);
      if (noEncontradas.length > 0) {
        toast.warning(`${noEncontradas.length} cuadrilla(s) no encontradas en la plantilla: ${noEncontradas.slice(0, 3).join(", ")}${noEncontradas.length > 3 ? "…" : ""}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo exportar la plantilla");
    }
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
    const day = dayjs(next).day();
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

  const coberturaColorBg = (estado: CoberturaEstado) => {
    if (estado === "ok") return "bg-emerald-500/20 border-emerald-400/30 text-emerald-100";
    if (estado === "warn") return "bg-amber-500/20 border-amber-400/30 text-amber-100";
    if (estado === "bad") return "bg-rose-500/25 border-rose-400/40 text-rose-100";
    return "bg-slate-700/30 border-slate-600/30 text-slate-300";
  };

  return (
    <div className="flex min-h-screen flex-col gap-5 p-4 text-slate-900 dark:text-slate-100 md:p-6">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-2xl border border-[#0d1f3f] bg-[linear-gradient(135deg,#0d1f3f_0%,#13315c_40%,#254b87_100%)] shadow-md dark:border-slate-700 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_50%,#1e293b_100%)]">
        <div className="flex flex-col gap-4 px-6 py-7 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white">
              <span className={cls("h-1.5 w-1.5 rounded-full", estado === "CERRADO" ? "bg-rose-400" : "bg-emerald-400")} />
              Programación semanal · {estado === "CERRADO" ? "Semana cerrada" : "Edición abierta"}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white lg:text-3xl">Asistencia programada</h1>
            <p className="mt-2 text-sm font-medium text-white/80">
              {weekDays.length > 0
                ? `Semana del ${dayjs(weekDays[0]).format("DD [de] MMMM")} al ${dayjs(weekDays[weekDays.length - 1]).format("DD [de] MMMM, YYYY")}`
                : "Selecciona una semana para comenzar"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Badge de rol */}
            {!canAdmin && (
              <span className={cls(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                myCoordinatorStatus === "CONFIRMADO" ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100" :
                myCoordinatorStatus === "BORRADOR"   ? "border-amber-300/40 bg-amber-500/20 text-amber-100" :
                                                       "border-white/20 bg-white/10 text-white/80"
              )}>
                {statusLabel(myCoordinatorStatus)}
              </span>
            )}
            {canAdmin && (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                Vista Gerencia / Admin
              </span>
            )}

            {/* Navegación de semana */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 p-1">
                <button
                  type="button"
                  disabled={cargando || !startYmd}
                  onClick={() => setStartYmd(dayjs(startYmd).subtract(7, "day").format("YYYY-MM-DD"))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-lg font-bold leading-none text-white/80 transition hover:bg-white/15 disabled:opacity-40"
                  title="Semana anterior"
                >
                  ‹
                </button>
                <div className="min-w-[118px] px-1 text-center">
                  <div className="text-xs font-semibold text-white">
                    {weekDays.length > 0
                      ? `${dayjs(weekDays[0]).format("DD/MM")} – ${dayjs(weekDays[weekDays.length - 1]).format("DD/MM")}`
                      : "–"}
                  </div>
                  {startYmd === currentWeekThursdayYmd() && (
                    <div className="text-[10px] font-medium text-emerald-300">semana actual</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={cargando || !startYmd}
                  onClick={() => setStartYmd(dayjs(startYmd).add(7, "day").format("YYYY-MM-DD"))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-lg font-bold leading-none text-white/80 transition hover:bg-white/15 disabled:opacity-40"
                  title="Semana siguiente"
                >
                  ›
                </button>
              </div>
              {startYmd !== currentWeekThursdayYmd() && startYmd && (
                <button
                  type="button"
                  disabled={cargando}
                  onClick={() => setStartYmd(currentWeekThursdayYmd())}
                  className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
                  title="Volver a la semana actual"
                >
                  Semana actual
                </button>
              )}
            </div>

            {/* Date input (solo admin para precisión) */}
            {canAdmin && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-white/80">Ir a</label>
                <input
                  type="date"
                  value={startYmd}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 outline-none shadow-sm transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-500"
                />
              </div>
            )}

            {/* Countdown cierre */}
            {openUntil && estado !== "CERRADO" && (
              <div className="rounded-xl border border-amber-300/30 bg-amber-500/15 px-3 py-1.5 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">Cierre coord.</div>
                <div className="font-mono text-base font-bold text-amber-100">{contador || "--:--:--"}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── FLUJO COORDINADOR (no-admin) ───────────────────────────────── */}
      {!canAdmin && (
        <section className={cls(
          "overflow-hidden rounded-2xl border shadow-sm",
          myCoordinatorStatus === "CONFIRMADO" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" :
          myCoordinatorStatus === "BORRADOR"   ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" :
                                                 "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        )}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className={cls(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold",
                myCoordinatorStatus === "CONFIRMADO" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300" :
                myCoordinatorStatus === "BORRADOR"   ? "bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300" :
                                                       "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              )}>
                {myCoordinatorStatus === "CONFIRMADO" ? "✓" : myCoordinatorStatus === "BORRADOR" ? "✎" : "○"}
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {myCoordinatorStatus === "CONFIRMADO" ? "Programación confirmada" :
                   myCoordinatorStatus === "BORRADOR"   ? "Borrador guardado" :
                                                          "Pendiente de programar"}
                </div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {myCoordinatorStatus === "CONFIRMADO"
                    ? "Tu programación fue entregada. Quedará bloqueada hasta que Gerencia la reabra."
                    : myCoordinatorStatus === "BORRADOR"
                      ? "Tienes avances guardados. Confirma cuando la semana esté completa."
                      : "Carga la asistencia de tus cuadrillas y confirma antes del cierre."}
                </div>
                {estado === "CERRADO" && myCoordinatorStatus !== "CONFIRMADO" && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    ⚠ Semana cerrada. Comunícate con Gerencia para realizar cambios.
                  </div>
                )}
                {estado !== "CERRADO" && edicionCoordinadores === "PAUSADA" && myCoordinatorStatus !== "CONFIRMADO" && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    ⏸ Gerencia está revisando esta semana. La edición está pausada temporalmente.
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
              <button
                onClick={guardar}
                disabled={saving || isLocked}
                className="rounded-xl bg-[#254b87] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c3a68] disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                onClick={confirmarEntrega}
                disabled={!canConfirm || saving || isLocked}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
              >
                Confirmar semana
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── EQUIDAD DE TUS CUADRILLAS (coordinador) ─────────────────────── */}
      {!canAdmin && myCoordinatorUid && weekDays.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Equidad de tus cuadrillas</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Cuánto de tus cuadrillas puedes poner en descanso cada día sin cargar más peso del que te corresponde frente a otros coordinadores.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 md:grid-cols-7">
            {weekDays.map((d) => {
              const cuota = cuotaByCoordinadorDay[d];
              if (!cuota || cuota.estado === "none") return null;
              const tone =
                cuota.estado === "bad"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
              return (
                <div key={d} className={cls("rounded-xl border p-3 text-center", tone)}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide">{formatLabel(d)}</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {cuota.misDescansos}/{cuota.maxPermitido}
                  </div>
                  <div className="text-[10px] opacity-80">cuota equitativa</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── SOLICITUDES DE CAMBIO ─────────────────────────────────────── */}
      {(solicitudesRecibidas.length > 0 || solicitudesEnviadas.length > 0) && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {canAdmin ? "Solicitudes de cambio — pendientes de coordinadores" : "Solicitudes de cambio"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {solicitudesRecibidas.length > 0
                  ? `${solicitudesRecibidas.length} solicitud${solicitudesRecibidas.length !== 1 ? "es" : ""} pendiente${solicitudesRecibidas.length !== 1 ? "s" : ""} de revisión`
                  : "Sin solicitudes pendientes de revisión"}
              </div>
            </div>
            {solicitudesRecibidas.length > 0 && (
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                {solicitudesRecibidas.length}
              </span>
            )}
          </div>

          {/* Pendientes — para aprobar o rechazar */}
          {solicitudesRecibidas.length > 0 && (
            <div className="p-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                Para revisar
              </div>
              {solicitudesRecibidas.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {s.cuadrillaNombre}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatLabel(s.dia)} · De{" "}
                        <span className="font-medium">{s.solicitanteNombre}</span>
                        {canAdmin && (
                          <> → <span className="font-medium">{s.propietarioNombre}</span></>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={cls(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            estadoColor(s.estadoActual),
                          )}
                        >
                          {ESTADO_META[s.estadoActual as keyof typeof ESTADO_META]?.label || s.estadoActual}
                        </span>
                        <span className="text-[11px] text-slate-400">→</span>
                        <span
                          className={cls(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            estadoColor(s.estadoSolicitado),
                          )}
                        >
                          {ESTADO_META[s.estadoSolicitado as keyof typeof ESTADO_META]?.label || s.estadoSolicitado}
                        </span>
                      </div>
                      {s.mensaje && (
                        <div className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">
                          "{s.mensaje}"
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => responderSolicitud(s.id, "ACEPTAR")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => responderSolicitud(s.id, "RECHAZAR")}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Enviadas — mis solicitudes */}
          {solicitudesEnviadas.length > 0 && (
            <div
              className={cls(
                "p-4 space-y-2",
                solicitudesRecibidas.length > 0
                  ? "border-t border-slate-100 dark:border-slate-800"
                  : "",
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                Mis solicitudes enviadas
              </div>
              {solicitudesEnviadas.map((s) => (
                <div
                  key={s.id}
                  className={cls(
                    "rounded-xl border p-3",
                    s.estado === "PENDIENTE"
                      ? "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10"
                      : s.estado === "APROBADA"
                        ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/10"
                        : "border-slate-200 bg-slate-50/30 dark:border-slate-700 dark:bg-slate-950/10",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {s.cuadrillaNombre}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatLabel(s.dia)} · Para{" "}
                        <span className="font-medium">{s.propietarioNombre}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={cls(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            estadoColor(s.estadoActual),
                          )}
                        >
                          {ESTADO_META[s.estadoActual as keyof typeof ESTADO_META]?.label || s.estadoActual}
                        </span>
                        <span className="text-[11px] text-slate-400">→</span>
                        <span
                          className={cls(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            estadoColor(s.estadoSolicitado),
                          )}
                        >
                          {ESTADO_META[s.estadoSolicitado as keyof typeof ESTADO_META]?.label || s.estadoSolicitado}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cls(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        s.estado === "PENDIENTE"
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                          : s.estado === "APROBADA"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
                      )}
                    >
                      {s.estado === "PENDIENTE"
                        ? "Pendiente"
                        : s.estado === "APROBADA"
                          ? "Aprobada"
                          : s.estado === "RECHAZADA"
                            ? "Rechazada"
                            : "Cancelada"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── PANEL ADMIN / GERENCIA ─────────────────────────────────────── */}
      {canAdmin && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Control de semana</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Supervisa avance, configura el cierre de coordinadores y bloquea la edición.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Cierre coord.</label>
                <input
                  type="time"
                  value={openUntil ? dayjs(openUntil).format("HH:mm") : ""}
                  onChange={(e) => setOpenUntilTime(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                onClick={guardar}
                disabled={saving || isLocked}
                className="rounded-xl bg-[#254b87] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c3a68] disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                onClick={() => (edicionCoordinadores === "PAUSADA" ? confirmarReanudarEdicion() : confirmarPausarEdicion())}
                disabled={estado === "CERRADO"}
                title="Pausa solo a los coordinadores para revisar, sin cerrar la semana completa"
                className={cls(
                  "rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50",
                  edicionCoordinadores === "PAUSADA"
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                {edicionCoordinadores === "PAUSADA" ? "Reanudar edición coordinadores" : "Pausar edición coordinadores"}
              </button>
              <button
                onClick={() => (estado === "CERRADO" ? confirmarAbrir() : confirmarCerrar())}
                className={cls(
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
                  estado === "CERRADO" ? "bg-slate-600 hover:bg-slate-700" : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {estado === "CERRADO" ? "Abrir semana" : "Cerrar semana"}
              </button>
            </div>
          </div>
          {coordinadoresEstado.length > 0 && (
            <div className="px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Progreso de coordinadores — {coordinadoresConfirmados} de {coordinadoresEstado.length} confirmados
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {ultimaConfirmacion
                    ? `Último: ${ultimaConfirmacion.coordinadorNombre} · ${asLocalDateTime(ultimaConfirmacion.confirmedAt)}`
                    : "Sin confirmaciones aún"}
                </div>
              </div>
              <Progress value={coordinadoresEstado.length ? (coordinadoresConfirmados / coordinadoresEstado.length) * 100 : 0} />
            </div>
          )}
        </section>
      )}

      {/* ── MÉTRICAS ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Cuadrillas"
          value={String(totalVisible)}
          help={rows.length !== totalVisible ? `de ${rows.length} totales` : "programadas esta semana"}
          progress={rows.length ? Number(((totalVisible / rows.length) * 100).toFixed(1)) : 0}
        />
        <MetricCard
          label="Con descanso"
          value={String(conDescanso)}
          help={`${sinDescansoCount} sin descanso programado`}
          tone={sinDescansoCount > 0 ? "warn" : "default"}
        />
        <MetricCard
          label="Sin asistencia"
          value={String(sinAsistencia.length)}
          help="Ningún día con asistencia"
          tone={sinAsistencia.length > 0 ? "bad" : "default"}
        />
        <MetricCard
          label="Feriados"
          value={String(feriados.length)}
          help="Marcados esta semana"
          tone="good"
        />
      </div>

      {canAdmin && coordinadoresEstado.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Coordinadores" value={String(coordinadoresEstado.length)} help="Asignados esta semana" />
          <MetricCard
            label="Confirmados"
            value={String(coordinadoresConfirmados)}
            help="Listos para revisión"
            tone="good"
            progress={coordinadoresEstado.length ? Number(((coordinadoresConfirmados / coordinadoresEstado.length) * 100).toFixed(1)) : 0}
          />
          <MetricCard label="En progreso" value={String(coordinadoresBorrador)} help="Con avances guardados" tone="warn" />
          <MetricCard
            label="Sin iniciar"
            value={String(coordinadoresPendientes)}
            help="Pendientes de acción"
            tone={coordinadoresPendientes > 0 ? "bad" : "default"}
          />
        </div>
      )}

      {/* ── SEGUIMIENTO POR COORDINADOR (admin) ────────────────────────── */}
      {canAdmin && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Seguimiento por coordinador</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Haz clic en una tarjeta para filtrar la grilla. Puedes reabrir el acceso individualmente.</div>
            </div>
            {coordinadorUid && (
              <button
                type="button"
                onClick={() => setCoordinadorUid("")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="p-4">
            {coordinadoresEstado.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No hay coordinadores para esta semana.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
                      "cursor-pointer rounded-xl border p-3 text-left transition",
                      coordinadorUid === coord.coordinadorUid
                        ? "border-[#254b87] bg-blue-50 ring-1 ring-[#254b87]/20 dark:border-sky-500 dark:bg-sky-950/30"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{coord.coordinadorNombre}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{coord.cuadrillas} cuadrillas</div>
                      </div>
                      <span className={cls("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusTone(coord.status))}>
                        {statusLabel(coord.status)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <div className="truncate">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Guardado </span>
                        {asLocalDateTime(coord.updatedAt)}
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Confirmado </span>
                        {asLocalDateTime(coord.confirmedAt)}
                      </div>
                    </div>
                    {(() => {
                      const dias = weekDays
                        .map((d) => cupoYCuotaCoordinador(d, coord.coordinadorUid, rows, items))
                        .filter((c) => c.estado !== "none");
                      if (dias.length === 0) return null;
                      const diasExcedidos = dias.filter((c) => c.estado === "bad").length;
                      return (
                        <div className={cls(
                          "mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                          diasExcedidos > 0
                            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        )}>
                          Equidad: {dias.length - diasExcedidos}/{dias.length} días dentro de cuota
                        </div>
                      );
                    })()}
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); reabrirCoordinador(coord.coordinadorUid); }}
                        disabled={estado === "CERRADO"}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Reabrir acceso
                      </button>
                      {coord.reopenedByNombre && (
                        <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                          por {coord.reopenedByNombre}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── COBERTURA + LEYENDA + HERRAMIENTAS ────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        {/* Cobertura semanal */}
        {rows.length > 0 && weekDays.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cobertura semanal</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">% de asistencia actual vs. mínimo requerido por día</div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Cumple</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Cerca del límite</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" />Bajo el mínimo</span>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-4 lg:grid-cols-7">
              {coberturaResumen.map(({ ymd, label, info }) => {
                const domingo = dayjs(ymd, "YYYY-MM-DD").day() === 0;
                const holiday = feriados.includes(ymd);
                return (
                  <div key={ymd} className={cls("p-3", holiday ? "bg-sky-50/60 dark:bg-sky-950/20" : domingo ? "bg-amber-50/60 dark:bg-amber-950/20" : "")}>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                      <CoberturaIcon estado={info.estado} />
                    </div>
                    {domingo && info.residencial !== undefined ? (
                      <div className="space-y-1.5">
                        <div>
                          <div className="mb-0.5 text-[10px] text-slate-500 dark:text-slate-400">Residencial</div>
                          <CoberturaBar pct={info.residencial.pct} minPct={info.residencial.minPct} estado={info.residencial.estado} />
                        </div>
                        {info.moto !== undefined && (
                          <div>
                            <div className="mb-0.5 text-[10px] text-slate-500 dark:text-slate-400">Moto</div>
                            <CoberturaBar pct={info.moto.pct} minPct={info.moto.minPct} estado={info.moto.estado} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <CoberturaBar pct={info.pct} minPct={info.minPct} estado={info.estado} />
                    )}
                    {holiday && <div className="mt-1 text-[10px] text-sky-600 dark:text-sky-400">Feriado</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Leyenda de estados */}
        <div className={cls("px-5 py-3.5", rows.length > 0 ? "border-t border-slate-100 dark:border-slate-800" : "")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Estados:</span>
            {(["asistencia", "descanso"] as const).map((estadoTip) => (
              <span key={estadoTip} className={cls("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", estadoColor(estadoTip))}>
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/60 px-0.5 text-[10px] dark:bg-black/20">
                  {ESTADO_META[estadoTip].short}
                </span>
                {ESTADO_META[estadoTip].label}
              </span>
            ))}
          </div>
        </div>

        {/* Toolbar: filtros + acciones + exportar */}
        <div className="flex flex-wrap items-start gap-4 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/50">

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Filtrar</span>
            <select
              value={coordinadorUid}
              onChange={(e) => setCoordinadorUid(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todos los coordinadores</option>
              {coordinadoresUnicos.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.nombre}{!canAdmin && myCoordinatorUid && c.uid === myCoordinatorUid ? " (mis cuadrillas)" : ""}
                </option>
              ))}
            </select>
            {coordinadorUid && (
              <button
                type="button"
                onClick={() => setCoordinadorUid("")}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Ver todas
              </button>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              <input type="checkbox" checked={soloDescanso} onChange={(e) => setSoloDescanso(e.target.checked)} className="h-3 w-3 rounded" />
              Solo con descanso
            </label>
          </div>

          {canAdmin && (
            <>
              <div className="h-6 w-px self-center bg-slate-200 dark:bg-slate-700 max-sm:hidden" />

              {/* Acciones rápidas — solo admin/gerencia */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Acciones</span>
                <button
                  onClick={copiarSemanaAnterior}
                  disabled={isLocked}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Copiar semana anterior
                </button>
                <button
                  disabled={isLocked || rows.length === 0}
                  onClick={handleAutoGenerar}
                  className="rounded-lg border border-[#30518c] bg-[#30518c]/10 px-3 py-1.5 text-xs font-semibold text-[#30518c] transition hover:bg-[#30518c]/20 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300"
                >
                  Generar automático
                </button>
                <button
                  onClick={() => weekDays.filter((d) => dayjs(d).day() === 0).forEach((d) => setAllRowsForDay(d, "descanso"))}
                  disabled={isLocked}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Domingo descanso
                </button>
                <div className="flex items-center gap-1.5">
                  <select
                    value={feriadoDay}
                    onChange={(e) => setFeriadoDay(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Marcar feriado…</option>
                    {weekDays.map((d) => <option key={d} value={d}>{formatLabel(d)}</option>)}
                  </select>
                  <button
                    disabled={isLocked || !feriadoDay}
                    onClick={() => {
                      if (!feriadoDay) return;
                      setAllRowsForDay(feriadoDay, "descanso");
                      setFeriados((prev) => (prev.includes(feriadoDay) ? prev : [...prev, feriadoDay]));
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Marcar
                  </button>
                </div>
              </div>

              <div className="h-6 w-px self-center bg-slate-200 dark:bg-slate-700 max-sm:hidden" />

              {/* Exportar — solo admin/gerencia */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Exportar</span>
                <input ref={plantillaInputRef} type="file" accept=".xlsx" className="hidden" onChange={handlePlantillaUpload} />
                <button
                  type="button"
                  onClick={() => plantillaInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {plantillaNombre ? "Cambiar plantilla" : "Subir plantilla .xlsx"}
                </button>
                {plantillaNombre ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <span className="max-w-[120px] truncate">{plantillaNombre}</span>
                    <button type="button" onClick={() => { setPlantillaBuffer(null); setPlantillaNombre(""); }} className="text-emerald-500 hover:text-emerald-700">✕</button>
                  </div>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Requerida para exportar</span>
                )}
                <button
                  onClick={exportarExcel}
                  disabled={rows.length === 0 || !plantillaBuffer}
                  className="rounded-lg bg-[#254b87] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1c3a68] disabled:opacity-50"
                >
                  Descargar Excel
                </button>
                <div className="h-4 w-px self-center bg-slate-200 dark:bg-slate-700" />
                <button
                  onClick={exportarExcelDetalle}
                  disabled={rows.length === 0}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                >
                  Detalle semanal
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── GRILLA DE ASISTENCIA ───────────────────────────────────────── */}
      <section ref={tableAreaRef} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Grilla de asistencia</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{visibleRows.length} cuadrillas</span>
              {weekDays.length > 0 && (
                <span>· Semana {dayjs(weekDays[0]).format("DD/MM")}–{dayjs(weekDays[weekDays.length - 1]).format("DD/MM")}</span>
              )}
              {isLocked && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Bloqueada
                </span>
              )}
            </div>
          </div>
          {sinAsistencia.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              ⚠ {sinAsistencia.length} cuadrilla{sinAsistencia.length !== 1 ? "s" : ""} sin asistencia ningún día
            </div>
          )}
        </div>

        {/* Cabecera sticky */}
        <div className="sticky top-[72px] z-40">
          <div ref={headerScrollRef} className="overflow-x-hidden">
            <div
              className="grid bg-slate-900 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 dark:bg-slate-950"
              style={{ gridTemplateColumns: tableColumns, minWidth: `${tableMinWidthPx}px`, width: `${tableMinWidthPx}px` }}
            >
              <div className="sticky left-0 z-30 border-b border-r border-slate-700 bg-slate-900 px-4 py-3 dark:bg-slate-950" style={{ width: `${firstColWidth}px` }}>
                Cuadrilla
              </div>
              {weekDays.map((d) => {
                const sunday = isSunday(d);
                const holiday = feriados.includes(d);
                const cob = coberturaByDay[d];
                return (
                  <div
                    key={`h_${d}`}
                    className={cls(
                      "border-b border-slate-700 px-2 py-3 text-center",
                      holiday ? "bg-sky-950/80" : sunday ? "bg-amber-950/80" : "bg-slate-900 dark:bg-slate-950"
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-white">{formatLabel(d)}</span>
                      {sunday && <span className="rounded-full bg-amber-400/20 px-1.5 py-px text-[9px] text-amber-200">Dom</span>}
                      {holiday && <span className="rounded-full bg-sky-400/20 px-1.5 py-px text-[9px] text-sky-200">Feriado</span>}
                      {cob && cob.estado !== "none" && rows.length > 0 && (
                        <div className={cls("rounded-full border px-1.5 py-px text-[9px] font-bold", coberturaColorBg(cob.estado))}>
                          {sunday && cob.residencial ? `R:${cob.residencial.pct}% M:${cob.moto?.pct ?? "-"}%` : `${cob.pct}%`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="border-b border-slate-700 bg-slate-900 px-4 py-3 dark:bg-slate-950" style={{ width: `${actionsColWidth}px` }}>
                Acciones
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={bodyScrollRef} className="overflow-x-auto">
          {cargando ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
            </div>
          ) : (
            <table
              className="mx-auto table-fixed border-separate border-spacing-0 text-sm"
              style={{ minWidth: `${tableMinWidthPx}px`, width: `${tableMinWidthPx}px` }}
            >
              <colgroup>
                <col style={{ width: `${firstColWidth}px` }} />
                {weekDays.map((d) => <col key={`col_${d}`} style={{ width: `${computedDayWidth}px` }} />)}
                <col style={{ width: `${actionsColWidth}px` }} />
              </colgroup>
              <thead className="sr-only">
                <tr>
                  <th>Cuadrilla</th>
                  {weekDays.map((d) => <th key={d}>{formatLabel(d)}</th>)}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, idx) => {
                  const dc = descansoCount(r.id);
                  const ac = asistenciaCount(r.id);
                  // Cuadrilla propia del coordinador logueado (o admin ve todo)
                  const isOwnRow = canAdmin || !myCoordinatorUid || r.coordinadorUid === myCoordinatorUid;
                  const rowLocked = isLocked || !isOwnRow;
                  return (
                    <tr
                      key={r.id}
                      className={cls(
                        "border-b border-slate-100 dark:border-slate-800",
                        !isOwnRow
                          ? "bg-slate-50/80 dark:bg-slate-900/30"
                          : idx % 2 ? "bg-slate-50/60 dark:bg-slate-900/50" : "bg-white dark:bg-slate-950"
                      )}
                    >
                      <td
                        className={cls(
                          "sticky left-0 z-10 border-r border-slate-100 px-4 py-3 align-top dark:border-slate-800",
                          !isOwnRow
                            ? "bg-slate-50 dark:bg-slate-900/60"
                            : idx % 2 ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-950"
                        )}
                        style={{ width: `${firstColWidth}px` }}
                      >
                        <div className={cls("font-semibold", isOwnRow ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400")}>
                          {r.nombre}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {!isOwnRow && (
                            <span className="rounded-full bg-slate-200 px-1.5 py-px text-[9px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              Otro coord.
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{r.coordinadorNombre || "-"}</span>
                        </div>
                      </td>
                      {weekDays.map((d) => {
                        const currentValue = String(items?.[r.id]?.[d] || "asistencia");
                        const cellMenuId = `${r.id}_${d}`;
                        const isMenuOpen = openCellMenu === cellMenuId;
                        const sunday = isSunday(d);
                        const holiday = feriados.includes(d);
                        const cellLocked = rowLocked || (!canAdmin && isPastDay(d));
                        return (
                          <td
                            key={`${r.id}_${d}`}
                            className={cls(
                              "px-1.5 py-2",
                              sunday ? "bg-amber-50/40 dark:bg-amber-950/10" : "",
                              holiday ? "bg-sky-50/40 dark:bg-sky-950/10" : ""
                            )}
                          >
                            {isOwnRow ? (
                              // Celda editable — cuadrilla propia
                              <div className="relative" data-asistencia-cell-menu="true">
                                <button
                                  type="button"
                                  disabled={cellLocked}
                                  title={!rowLocked && cellLocked ? "No se puede editar un día que ya pasó" : undefined}
                                  onClick={() => setOpenCellMenu((prev) => (prev === cellMenuId ? null : cellMenuId))}
                                  className={cls(
                                    "mx-auto flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold shadow-sm transition",
                                    dc > 2 ? "ring-1 ring-rose-300 dark:ring-rose-700" : "",
                                    estadoColor(currentValue),
                                    cellLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-90"
                                  )}
                                >
                                  <span className="truncate">{ESTADO_META[currentValue as keyof typeof ESTADO_META]?.label || currentValue}</span>
                                  {!cellLocked && <span className="shrink-0 text-[9px] opacity-50">{isMenuOpen ? "▲" : "▼"}</span>}
                                </button>
                                {isMenuOpen && !cellLocked && (
                                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
                                    <div className="overflow-auto p-1">
                                      {(["asistencia", "descanso"] as const).map((e) => (
                                        <button
                                          key={e}
                                          type="button"
                                          onClick={() => { updateCell(r.id, d, e); setOpenCellMenu(null); }}
                                          className={cls(
                                            "mb-0.5 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition last:mb-0",
                                            estadoColor(e),
                                            e === currentValue ? "ring-2 ring-[#254b87] ring-offset-1 dark:ring-sky-400 dark:ring-offset-slate-950" : ""
                                          )}
                                        >
                                          <span>{ESTADO_META[e].label}</span>
                                          <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                                            {ESTADO_META[e].short}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              // Celda solo lectura — cuadrilla de otro coordinador
                              <div className="relative">
                                <div
                                  className={cls(
                                    "mx-auto flex w-full items-center justify-center rounded-lg border px-2 py-1.5 text-[11px] font-semibold opacity-70",
                                    estadoColor(currentValue)
                                  )}
                                >
                                  <span className="truncate">{ESTADO_META[currentValue as keyof typeof ESTADO_META]?.short || currentValue.slice(0, 1).toUpperCase()}</span>
                                </div>
                                {pendingByCell.has(cellMenuId) && (
                                  <span
                                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900"
                                    title="Solicitud pendiente"
                                  />
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3">
                        {isOwnRow ? (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => setRowAll(r.id, "asistencia")}
                              disabled={rowLocked}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              De largo
                            </button>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              A: {ac} · <span className={dc > 2 ? "font-semibold text-rose-500" : ""}>D: {dc}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {myCategories.has(categoriaCuadrilla(r)) ? (
                              <button
                                type="button"
                                onClick={() => abrirModalSolicitud(r)}
                                className="rounded-lg border border-[#254b87]/30 bg-[#254b87]/5 px-3 py-1.5 text-[11px] font-medium text-[#254b87] transition hover:bg-[#254b87]/10 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-950/40"
                              >
                                Solicitar cambio
                              </button>
                            ) : (
                              <div className="rounded-lg border border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-600">
                                {categoriaCuadrilla(r) === "RESIDENCIAL" ? "Residencial" : categoriaCuadrilla(r) === "MOTO" ? "Moto" : "Otro"}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              A: {ac} · D: {dc}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={weekDays.length + 2}>
                      <EmptyState title="No hay cuadrillas para mostrar" description="Prueba cambiando la semana o limpiando los filtros." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── MODAL SOLICITAR CAMBIO ─────────────────────────────────────── */}
      {solicitudModal && (() => {
        const estadoActualModal = modalDia
          ? String(items?.[solicitudModal.row.id]?.[modalDia] || "asistencia")
          : "asistencia";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              {/* Cabecera */}
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Solicitar cambio de asistencia
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  La solicitud se enviará al coordinador responsable para su aprobación.
                  El cambio se aplicará solo si respeta los % mínimos de cobertura.
                </div>
              </div>

              {/* Cuerpo */}
              <div className="space-y-4 px-5 py-4">
                {/* Info cuadrilla */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Cuadrilla
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {solicitudModal.row.nombre}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {solicitudModal.row.coordinadorNombre}
                  </div>
                </div>

                {/* Selector de día */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Día
                  </label>
                  <select
                    value={modalDia}
                    onChange={(e) => {
                      setModalDia(e.target.value);
                      const ea = String(items?.[solicitudModal.row.id]?.[e.target.value] || "asistencia");
                      setModalEstado(ea === "asistencia" ? "descanso" : "asistencia");
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Selecciona un día…</option>
                    {weekDays.map((d) => {
                      const ea = String(items?.[solicitudModal.row.id]?.[d] || "asistencia");
                      const hasPending = pendingByCell.has(`${solicitudModal.row.id}_${d}`);
                      return (
                        <option key={d} value={d} disabled={hasPending}>
                          {formatLabel(d)} — {ESTADO_META[ea as keyof typeof ESTADO_META]?.label || ea}
                          {hasPending ? " (pendiente)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Cambio de estado */}
                {modalDia && (
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Estado actual
                      </div>
                      <div
                        className={cls(
                          "inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                          estadoColor(estadoActualModal),
                        )}
                      >
                        {ESTADO_META[estadoActualModal as keyof typeof ESTADO_META]?.label || estadoActualModal}
                      </div>
                    </div>
                    <div className="pb-1.5 text-slate-400">→</div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Cambiar a
                      </label>
                      <select
                        value={modalEstado}
                        onChange={(e) => setModalEstado(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {(["asistencia", "descanso"] as const)
                          .filter((e) => e !== estadoActualModal)
                          .map((e) => (
                            <option key={e} value={e}>
                              {ESTADO_META[e].label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Mensaje */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Mensaje (opcional)
                  </label>
                  <textarea
                    value={modalMensaje}
                    onChange={(e) => setModalMensaje(e.target.value)}
                    placeholder="Ej: Necesito ajustar el descanso por operación especial"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSolicitudModal(null)}
                  disabled={modalEnviando}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={enviarSolicitud}
                  disabled={modalEnviando || !modalDia}
                  className="rounded-xl bg-[#254b87] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c3a68] disabled:opacity-50"
                >
                  {modalEnviando ? "Enviando..." : "Enviar solicitud"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
