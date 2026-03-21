"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { toast } from "sonner";

type StorageItem = {
  name: string;
  fullPath: string;
  size: number;
  updatedAt: string;
};

type ListResponse = {
  ok: boolean;
  dateFolder: string;
  inbox: StorageItem[];
  okFiles: StorageItem[];
  errorFiles: StorageItem[];
  stats?: {
    instalacionesDia: number;
    actasOkDia: number;
    faltanActas: number;
    sobranActas?: number;
  };
  actaAudit?: {
    summary: {
      esperadasConActa: number;
      instalacionesSinActa: number;
      okConActa: number;
      okDentroFecha: number;
      okFueraFecha: number;
      sobrantes: number;
      faltantes: number;
      okSinTrazabilidad: number;
    };
    okDentroFecha: Array<{
      fileName: string;
      fullPath: string;
      acta: string;
      codigoCliente: string;
      cliente: string;
      fechaBaseYmd: string;
      fechaOrdenYmd: string;
      fechaInstalacionYmd: string;
    }>;
    okFueraFecha: Array<{
      fileName: string;
      fullPath: string;
      acta: string;
      fechasSugeridas: string[];
    }>;
    sobrantes: Array<{
      fileName: string;
      fullPath: string;
      tipo: "duplicada" | "fuera_fecha" | "sin_trazabilidad";
      acta: string;
      fechasSugeridas: string[];
      codigoCliente?: string;
      cliente?: string;
    }>;
    faltantes: Array<{
      id: string;
      acta: string;
      codigoCliente: string;
      cliente: string;
      fechaBaseYmd: string;
      fechaOrdenYmd: string;
      fechaInstalacionYmd: string;
    }>;
    sinActa: Array<{
      id: string;
      codigoCliente: string;
      cliente: string;
      fechaBaseYmd: string;
      fechaOrdenYmd: string;
      fechaInstalacionYmd: string;
    }>;
    okSinTrazabilidad: Array<{
      fileName: string;
      fullPath: string;
    }>;
  };
  error?: string;
};

type UploadResult = {
  originalName: string;
  acta: string | null;
  source: "pdf_text" | "det_engine" | "ai_pdf" | null;
  status: "ok" | "error";
  finalPath: string;
  finalName: string;
  reason: string;
  detail: string;
  attempts?: number;
  durationMs?: number;
  trace?: Array<{
    stage: string;
    label: string;
    status: "done" | "miss" | "error";
    detail: string;
    durationMs: number;
  }>;
};

type UploadResponse = {
  ok: boolean;
  dateFolder: string;
  uploaded: UploadResult[];
  summary: {
    total: number;
    ok: number;
    error: number;
  };
  error?: string;
};

type ReprocessRigorousResponse = {
  ok: boolean;
  mode?: "rigorous";
  result?: UploadResult;
  error?: string;
};

type QueueStatus = "queued" | "processing" | "done" | "error";
type UploadQueueItem = {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  status: QueueStatus;
  message: string;
};

type ProgressResponse = {
  ok: boolean;
  requestId?: string;
  progress?: {
    status?: "processing" | "ok" | "error";
    stageKey?: string;
    stageLabel?: string;
    stageStatus?: "running" | "done" | "miss" | "error";
    detail?: string;
    useAi?: boolean;
    durationMs?: number;
  } | null;
  error?: string;
};

type MonthSummaryResponse = {
  ok: boolean;
  month?: string;
  days?: MonthSummaryDay[];
  error?: string;
};

type MonthSummaryDay = {
  dateFolder: string;
  inboxCount: number;
  okCount: number;
  errorCount: number;
  instalacionesDia: number;
  actasOkDia: number;
  faltanActas: number;
  sobranActas: number;
  instalacionesSinActa: number;
};

const MAX_FILES_PER_BATCH = 300;

const looksLikeIndexedCopy = (fileName: string) => /\(\d+\)\.pdf$/i.test(String(fileName || "").trim());

const bytesToHuman = (bytes: number) => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const reasonToLabel = (reason: string, detail?: string) => {
  const code = String(reason || "").trim().toUpperCase();
  if (code === "ALREADY_PROCESSING") return "Ya se esta procesando en otra pestana";
  if (code === "TOO_MANY_REQUESTS") return "Demasiados procesos en paralelo";
  if (code === "REQUEST_ERROR") {
    const d = String(detail || "").toLowerCase();
    if (d.includes("failed to fetch")) return "No se pudo conectar con el servidor";
    return "Fallo de comunicacion con el servidor";
  }
  if (code === "IDEMPOTENTE_CACHE") return "Archivo ya procesado (cache)";
  if (code === "NO_PDF") return "El archivo no es PDF";
  if (code === "PDF_SIZE_INVALID") return "Tamano de PDF invalido";
  if (code === "UNAUTHENTICATED") return "Sesion expirada. Vuelve a iniciar sesion";
  if (code === "FORBIDDEN") return "Sin permisos para esta accion";
  return code || "ERROR";
};

const formatApiUploadError = (status: number, body: { error?: string; detail?: string }) => {
  const code = String(body?.error || "").trim().toUpperCase();
  const detail = String(body?.detail || "").trim();
  if (status === 429 || code === "TOO_MANY_REQUESTS") {
    return detail || "Demasiados procesos en paralelo. Espera y vuelve a intentar.";
  }
  if (code === "UNAUTHENTICATED") return "Sesion expirada. Vuelve a iniciar sesion.";
  if (code === "FORBIDDEN") return "No tienes permiso para esta accion.";
  return detail || body?.error || "No se pudo procesar archivo";
};

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "error" | "info" }) {
  const base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";
  const tones = {
    neutral: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200",
    error: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/25 dark:text-rose-200",
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/25 dark:text-blue-200",
  };
  return <span className={`${base} ${tones[tone]}`}>{children}</span>;
}

export default function ActasRenombrarClient() {
  const [dateFolder, setDateFolder] = useState(dayjs().format("YYYY-MM-DD"));
  const [monthFilter, setMonthFilter] = useState(dayjs().format("YYYY-MM"));
  const [selectedDateFolder, setSelectedDateFolder] = useState<string | null>(null);
  const [dateConfirmedForUpload, setDateConfirmedForUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [movingPath, setMovingPath] = useState<string | null>(null);
  const [movingSobrantePath, setMovingSobrantePath] = useState<string | null>(null);
  const [cleaningOld, setCleaningOld] = useState(false);
  const [cleaningDay, setCleaningDay] = useState(false);
  const [downloadingOkZip, setDownloadingOkZip] = useState(false);
  const [bulkMovingErrorToInbox, setBulkMovingErrorToInbox] = useState(false);
  const [bulkDeletingInbox, setBulkDeletingInbox] = useState(false);
  const [bulkReprocessingInbox, setBulkReprocessingInbox] = useState(false);
  const [reprocessingPath, setReprocessingPath] = useState<string | null>(null);
  const [reprocessingInboxPath, setReprocessingInboxPath] = useState<string | null>(null);
  const [reprocessingOkPath, setReprocessingOkPath] = useState<string | null>(null);
  const [highlightedOkPath, setHighlightedOkPath] = useState<string | null>(null);
  const [manualCodigoDraft, setManualCodigoDraft] = useState<Record<string, string>>({});
  const [manualClienteDraft, setManualClienteDraft] = useState<Record<string, string>>({});
  const [list, setList] = useState<ListResponse | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummaryDay[]>([]);
  const [loadingMonthSummary, setLoadingMonthSummary] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const okSectionRef = useRef<HTMLDivElement | null>(null);
  const okRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const queueRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const queueContainerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    return { count: files.length, totalBytes };
  }, [files]);

  const displayDate = useMemo(() => {
    const parsed = dayjs(dateFolder, "YYYY-MM-DD", true);
    return parsed.isValid() ? parsed.format("DD/MM/YYYY") : dateFolder;
  }, [dateFolder]);

  const displayMonth = useMemo(() => {
    const parsed = dayjs(`${monthFilter}-01`, "YYYY-MM-DD", true);
    if (!parsed.isValid()) return monthFilter;
    return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(parsed.toDate());
  }, [monthFilter]);

  const missingByActaCount = list?.actaAudit?.faltantes?.length ?? 0;
  const missingWithoutActaCount = list?.actaAudit?.sinActa?.length ?? 0;
  const pendingVsInstallationsCount = Math.max(0, (list?.stats?.faltanActas ?? 0));

  const auditInsideByPath = useMemo(() => {
    return new Set((list?.actaAudit?.okDentroFecha || []).map((x) => x.fullPath));
  }, [list?.actaAudit?.okDentroFecha]);

  const auditOutsideByPath = useMemo(() => {
    const map = new Map<string, string[]>();
    (list?.actaAudit?.okFueraFecha || []).forEach((x) => {
      map.set(x.fullPath, x.fechasSugeridas || []);
    });
    return map;
  }, [list?.actaAudit?.okFueraFecha]);

  const auditNoTraceByPath = useMemo(() => {
    return new Set((list?.actaAudit?.okSinTrazabilidad || []).map((x) => x.fullPath));
  }, [list?.actaAudit?.okSinTrazabilidad]);

  const auditDuplicateByPath = useMemo(() => {
    const map = new Map<
      string,
      {
        acta: string;
        codigoCliente?: string;
        cliente?: string;
        suggestedToRemove: boolean;
      }
    >();
    (list?.actaAudit?.sobrantes || []).forEach((x) => {
      if (x.tipo !== "duplicada") return;
      map.set(x.fullPath, {
        acta: x.acta,
        codigoCliente: x.codigoCliente,
        cliente: x.cliente,
        suggestedToRemove: looksLikeIndexedCopy(x.fileName),
      });
    });
    return map;
  }, [list?.actaAudit?.sobrantes]);

  const activeQueueItem = useMemo(() => {
    if (!activeQueueId) return null;
    return uploadQueue.find((x) => x.id === activeQueueId) || null;
  }, [activeQueueId, uploadQueue]);

  const playTone = (kind: "ok" | "warn") => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "ok" ? 880 : 560;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
      osc.start(now);
      osc.stop(now + 0.21);
    } catch {
      // sonido opcional
    }
  };

  const refreshList = async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const qs = new URLSearchParams({ dateFolder });
      if (silent) qs.set("lite", "1");
      const res = await fetch(`/api/instalaciones/actas-dia/renombrar?${qs.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar archivos");
      setList((prev) => {
        if (!silent || data.actaAudit || !prev?.actaAudit) return data;
        return { ...data, stats: prev.stats, actaAudit: prev.actaAudit };
      });
      if (!silent && dateFolder.startsWith(monthFilter)) {
        void refreshMonthSummary();
      }
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Error cargando datos");
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  const refreshMonthSummary = async () => {
    if (!/^\d{4}-\d{2}$/.test(monthFilter)) return;
    setLoadingMonthSummary(true);
    try {
      const res = await fetch(`/api/instalaciones/actas-dia/renombrar?month=${encodeURIComponent(monthFilter)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as MonthSummaryResponse;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar el resumen mensual");
      setMonthSummary(data.days || []);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando resumen mensual");
    } finally {
      setLoadingMonthSummary(false);
    }
  };

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFolder]);

  useEffect(() => {
    void refreshMonthSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter]);

  useEffect(() => {
    const ms = uploading ? 4000 : 8000;
    const id = window.setInterval(() => {
      void refreshList(true);
    }, ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading, dateFolder]);

  useEffect(() => {
    if (!activeQueueId) return;
    const raf = window.requestAnimationFrame(() => {
      const row = queueRowRefs.current[activeQueueId];
      const container = queueContainerRef.current;
      if (!row || !container) return;
      const pad = 16;
      const rowRect = row.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const fullyVisible = rowRect.top >= containerRect.top + pad && rowRect.bottom <= containerRect.bottom - pad;
      if (fullyVisible) return;

      const deltaTop = rowRect.top - containerRect.top;
      const centeredTop = container.scrollTop + deltaTop - (container.clientHeight - row.offsetHeight) / 2;
      container.scrollTo({ top: Math.max(0, centeredTop), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeQueueId, uploadQueue]);

  useEffect(() => {
    if (!highlightedOkPath) return;
    const row = okRowRefs.current[highlightedOkPath];
    const section = okSectionRef.current;
    if (!row) return;
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [highlightedOkPath]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!incoming.length) {
      toast.error("Solo se permiten archivos PDF");
      return;
    }
    setFiles((prev) => {
      const existing = new Set(prev.map((x) => `${x.name}__${x.size}`));
      const next = [...prev];
      for (const f of incoming) {
        const key = `${f.name}__${f.size}`;
        if (!existing.has(key)) next.push(f);
      }
      if (next.length > MAX_FILES_PER_BATCH) {
        toast.error(`Maximo ${MAX_FILES_PER_BATCH} archivos por carga`);
        return next.slice(0, MAX_FILES_PER_BATCH);
      }
      return next;
    });
  };

  const uploadAll = async () => {
    if (!dateConfirmedForUpload) {
      return toast.error("Primero valida la fecha antes de subir");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
      return toast.error("Fecha invalida. Usa formato YYYY-MM-DD");
    }
    if (!files.length) return toast.error("Selecciona al menos un PDF");
    setUploading(true);
    setLastUpload(null);
    const seedBase = Date.now().toString(36);
    const queueSeed: UploadQueueItem[] = files.map((f, idx) => ({
      id: `rq_${seedBase}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: f.name,
      size: f.size,
      progress: 0,
      status: "queued",
      message: "En cola",
    }));
    setUploadQueue(queueSeed);
    try {
      const uploadedRows: UploadResult[] = [];

      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        const q = queueSeed[i];
        setActiveQueueId(q.id);
        setUploadQueue((prev) =>
          prev.map((x) => (x.id === q.id ? { ...x, status: "processing", message: "Subiendo y analizando PDF..." } : x))
        );

        let pulse = 8;
        let pulseAlive = true;
        const timer = window.setInterval(() => {
          if (!pulseAlive) return;
          pulse = Math.min(88, pulse + Math.floor(Math.random() * 8) + 2);
          setUploadQueue((prev) =>
            prev.map((x) => (x.id === q.id && x.status === "processing" ? { ...x, progress: pulse } : x))
          );
        }, 250);
        let pollInFlight = false;
        const progressPoll = window.setInterval(async () => {
          if (pollInFlight || !pulseAlive) return;
          pollInFlight = true;
          try {
            const res = await fetch(
              `/api/instalaciones/actas-dia/renombrar?requestId=${encodeURIComponent(q.id)}`,
              { cache: "no-store" }
            );
            const data = (await res.json()) as ProgressResponse;
            const p = data?.progress;
            if (!p) return;
            const stage = String(p.stageLabel || "Procesando");
            const detail = String(p.detail || "").trim();
            const aiTag = String(p.stageKey || "").startsWith("ai_") ? " [fallback IA]" : "";
            const msg = detail ? `${stage}${aiTag}: ${detail}` : `${stage}${aiTag}`;
            setUploadQueue((prev) =>
              prev.map((x) => (x.id === q.id && x.status === "processing" ? { ...x, message: msg } : x))
            );
          } catch {
            // no-op
          } finally {
            pollInFlight = false;
          }
        }, 900);

        try {
          const fd = new FormData();
          fd.set("dateFolder", dateFolder);
          fd.set("requestId", q.id);
          fd.append("files", f);
          const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
            method: "POST",
            body: fd,
          });
          const raw = await res.text();
          let data = {} as UploadResponse & { detail?: string };
          try {
            data = (raw ? JSON.parse(raw) : {}) as UploadResponse & { detail?: string };
          } catch {
            data = { ok: false, error: "", detail: raw || "" } as UploadResponse & { detail?: string };
          }
          if (!res.ok || !data?.ok) throw new Error(formatApiUploadError(res.status, data));
          const row = data.uploaded?.[0];
          if (!row) throw new Error("Sin respuesta de archivo");
          uploadedRows.push(row);
          pulseAlive = false;
          window.clearInterval(timer);
          window.clearInterval(progressPoll);
          setUploadQueue((prev) =>
            prev.map((x) =>
              x.id === q.id
                ? {
                    ...x,
                    progress: 100,
                    status: row.status === "ok" ? "done" : "error",
                    message:
                      row.status === "ok"
                        ? `Procesado OK (${row.source === "ai_pdf" ? "ANALISIS CON IA" : "LECTURA AUTOMATICA"})`
                        : reasonToLabel(row.reason, row.detail),
                  }
                : x
            )
          );
          await refreshList(false);
        } catch (e: any) {
          const msg = String(e?.message || "Error procesando archivo");
          uploadedRows.push({
            originalName: f.name,
            acta: null,
            source: null,
            status: "error",
            finalPath: "",
            finalName: "",
            reason: "REQUEST_ERROR",
            detail: msg,
            attempts: 0,
            durationMs: 0,
            trace: [],
          });
          pulseAlive = false;
          window.clearInterval(timer);
          window.clearInterval(progressPoll);
          setUploadQueue((prev) =>
            prev.map((x) => (x.id === q.id ? { ...x, progress: 100, status: "error", message: msg } : x))
          );
          await refreshList(false);
        } finally {
          pulseAlive = false;
          window.clearInterval(timer);
          window.clearInterval(progressPoll);
        }
      }

      const summary = uploadedRows.reduce(
        (acc, r) => {
          acc.total += 1;
          if (r.status === "ok") acc.ok += 1;
          else acc.error += 1;
          return acc;
        },
        { total: 0, ok: 0, error: 0 }
      );
      const data: UploadResponse = {
        ok: true,
        dateFolder,
        uploaded: uploadedRows,
        summary,
      };
      if (data.summary.error > 0) playTone("warn");
      else playTone("ok");
      setLastUpload(data);
      setFiles([]);
      setTimeout(() => setUploadQueue([]), 2500);
      setActiveQueueId(null);
      toast.success(`Carga completa: ${data.summary.ok} OK / ${data.summary.error} ERROR`);
      if (uploadedRows.some((r) => r.reason === "ALREADY_PROCESSING")) {
        toast.info("Algunos archivos se omitieron porque ya se estaban procesando en otra pestana.");
      }
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error subiendo actas");
    } finally {
      setUploading(false);
    }
  };

  const moveErrorToOk = async (item: StorageItem) => {
    const codigo = String(manualCodigoDraft[item.fullPath] || "").trim();
    const cliente = String(manualClienteDraft[item.fullPath] || "").trim();
    if (!codigo || !cliente) {
      return toast.error("Completa codigo y cliente para mover a OK");
    }
    const newName = `${codigo} - ${cliente}.pdf`;
    setMovingPath(item.fullPath);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFolder,
          fromPath: item.fullPath,
          newName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo mover");
      toast.success("Archivo movido a OK");
      setManualCodigoDraft((prev) => ({ ...prev, [item.fullPath]: "" }));
      setManualClienteDraft((prev) => ({ ...prev, [item.fullPath]: "" }));
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error moviendo archivo");
    } finally {
      setMovingPath(null);
    }
  };

  const reprocessRigorous = async (row: UploadResult) => {
    const fromPath = String(row.finalPath || "").trim();
    if (!fromPath) return toast.error("No se encontro la ruta del archivo en error");
    setReprocessingPath(fromPath);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprocess_rigorous",
          dateFolder,
          fromPath,
        }),
      });
      const data = (await res.json()) as ReprocessRigorousResponse;
      if (!res.ok || !data?.ok || !data?.result) throw new Error(data?.error || "No se pudo reanalizar");
      const nextRow = data.result;
      setLastUpload((prev) => {
        if (!prev) return prev;
        const updated = prev.uploaded.map((x) =>
          x.finalPath === fromPath
            ? {
                ...x,
                ...nextRow,
                originalName: x.originalName || nextRow.originalName,
              }
            : x
        );
        const summary = updated.reduce(
          (acc, item) => {
            acc.total += 1;
            if (item.status === "ok") acc.ok += 1;
            else acc.error += 1;
            return acc;
          },
          { total: 0, ok: 0, error: 0 }
        );
        return { ...prev, uploaded: updated, summary };
      });
      if (nextRow.status === "ok") toast.success("Reanalisis riguroso OK. Archivo movido a OK");
      else toast.warning(nextRow.detail || "Reanalisis completado, sigue en ERROR");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error en reanalisis riguroso");
    } finally {
      setReprocessingPath(null);
    }
  };

  const moveSobranteToSuggestedDate = async (item: NonNullable<ListResponse["actaAudit"]>["sobrantes"][number]) => {
    if (item.tipo !== "fuera_fecha") return;
    const suggested = Array.from(
      new Set(
        (item.fechasSugeridas || []).filter(
          (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) && String(x || "").trim() !== dateFolder
        )
      )
    );
    if (suggested.length !== 1) {
      return toast.error("Este archivo no tiene una unica fecha sugerida para mover automatico");
    }
    const toDateFolder = suggested[0];
    setMovingSobrantePath(item.fullPath);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_ok_to_date",
          dateFolder,
          fromPath: item.fullPath,
          toDateFolder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo mover a la fecha sugerida");
      toast.success(`Archivo movido a ${toDateFolder}`);
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error moviendo a fecha sugerida");
    } finally {
      setMovingSobrantePath(null);
    }
  };

  const moveOkToError = async (path: string) => {
    setMovingSobrantePath(path);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_ok_to_error",
          dateFolder,
          fromPath: path,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo sacar de OK");
      toast.success("Archivo movido de OK a ERROR");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error moviendo archivo");
    } finally {
      setMovingSobrantePath(null);
    }
  };

  const moveErrorToInbox = async (path: string) => {
    setMovingPath(path);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move_error_to_inbox",
          dateFolder,
          fromPath: path,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo sacar de ERROR");
      toast.success("Archivo movido de ERROR a INBOX");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error moviendo archivo");
    } finally {
      setMovingPath(null);
    }
  };

  const reprocessInboxFile = async (item: StorageItem) => {
    setReprocessingInboxPath(item.fullPath);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprocess_inbox",
          dateFolder,
          fromPath: item.fullPath,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo reprocesar");
      toast.success("Archivo reprocesado desde INBOX");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error reprocesando archivo");
    } finally {
      setReprocessingInboxPath(null);
    }
  };

  const deleteInboxFile = async (path: string) => {
    const confirmed = window.confirm(
      "Se eliminara este archivo de INBOX y no se podra recuperar. Deseas continuar?"
    );
    if (!confirmed) return;
    setMovingPath(path);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_inbox",
          dateFolder,
          fromPath: path,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo eliminar de INBOX");
      toast.success("Archivo eliminado de INBOX");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error eliminando archivo");
    } finally {
      setMovingPath(null);
    }
  };

  const moveAllErrorToInbox = async () => {
    const items = list?.errorFiles || [];
    if (!items.length) return toast.error("No hay archivos en ERROR para mover");
    const confirmed = window.confirm(
      `Se moveran ${items.length} archivos de ERROR a INBOX. Deseas continuar?`
    );
    if (!confirmed) return;

    setBulkMovingErrorToInbox(true);
    try {
      for (const item of items) {
        const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move_error_to_inbox",
            dateFolder,
            fromPath: item.fullPath,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo mover ${item.name}`);
      }
      toast.success("Todos los archivos de ERROR fueron movidos a INBOX");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error moviendo archivos de ERROR a INBOX");
    } finally {
      setBulkMovingErrorToInbox(false);
    }
  };

  const reprocessAllInboxFiles = async () => {
    const items = list?.inbox || [];
    if (!items.length) return toast.error("No hay archivos en INBOX para procesar");

    setBulkReprocessingInbox(true);
    try {
      for (const item of items) {
        const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reprocess_inbox",
            dateFolder,
            fromPath: item.fullPath,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo procesar ${item.name}`);
      }
      toast.success("Todos los archivos de INBOX fueron procesados");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error procesando archivos de INBOX");
    } finally {
      setBulkReprocessingInbox(false);
    }
  };

  const deleteAllInboxFiles = async () => {
    const items = list?.inbox || [];
    if (!items.length) return toast.error("No hay archivos en INBOX para quitar");
    const confirmed = window.confirm(
      `Se eliminaran ${items.length} archivos de INBOX y no se podran recuperar. Deseas continuar?`
    );
    if (!confirmed) return;

    setBulkDeletingInbox(true);
    try {
      for (const item of items) {
        const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_inbox",
            dateFolder,
            fromPath: item.fullPath,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || `No se pudo eliminar ${item.name}`);
      }
      toast.success("Todos los archivos de INBOX fueron eliminados");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error eliminando archivos de INBOX");
    } finally {
      setBulkDeletingInbox(false);
    }
  };

  const reprocessOkFile = async (item: StorageItem) => {
    setReprocessingOkPath(item.fullPath);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reprocess_ok",
          dateFolder,
          fromPath: item.fullPath,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo reprocesar el OK");
      toast.success("Archivo OK reprocesado");
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error reprocesando OK");
    } finally {
      setReprocessingOkPath(null);
    }
  };

  const focusOkFile = (path: string) => {
    setHighlightedOkPath(path);
  };

  const runCleanup = async () => {
    setCleaningOld(true);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "older_than", maxAgeDays: 7 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo limpiar");
      toast.success(`Limpieza > 7 dias completa. Eliminados: ${Number(data.deleted || 0)}`);
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error ejecutando limpieza");
    } finally {
      setCleaningOld(false);
    }
  };

  const runDayCleanup = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
      return toast.error("Fecha invalida para limpiar");
    }
    setCleaningDay(true);
    try {
      const res = await fetch("/api/instalaciones/actas-dia/renombrar/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "day", dateFolder }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo limpiar el dia");
      toast.success(`Dia ${dateFolder} limpiado. Eliminados: ${Number(data.deleted || 0)}`);
      await refreshList(false);
    } catch (e: any) {
      toast.error(e?.message || "Error limpiando el dia");
    } finally {
      setCleaningDay(false);
    }
  };

  const download = (path: string, mode: "download" | "view" = "download") => {
    window.open(
      `/api/instalaciones/actas-dia/renombrar/download?path=${encodeURIComponent(path)}&mode=${mode}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const downloadOkZip = () => {
    if (!list?.okFiles?.length) return toast.error("No hay archivos OK para descargar");
    setDownloadingOkZip(true);
    window.open(
      `/api/instalaciones/actas-dia/renombrar/zip?dateFolder=${encodeURIComponent(dateFolder)}`,
      "_blank",
      "noopener,noreferrer"
    );
    window.setTimeout(() => {
      setDownloadingOkZip(false);
    }, 400);
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      {!selectedDateFolder ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumen por mes</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Revisa por dia si instalaciones y actas OK coinciden antes de entrar al detalle.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <Badge tone="info">{displayMonth}</Badge>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Inst.</th>
                  <th className="p-2 text-left">OK</th>
                  <th className="p-2 text-left">Faltan</th>
                  <th className="p-2 text-left">Sobran</th>
                  <th className="p-2 text-left">Sin ACTA</th>
                  <th className="p-2 text-left">ERROR</th>
                  <th className="p-2 text-left">INBOX</th>
                  <th className="p-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loadingMonthSummary ? (
                  <tr>
                    <td colSpan={9} className="p-3 text-slate-500 dark:text-slate-400">
                      Cargando resumen mensual...
                    </td>
                  </tr>
                ) : monthSummary.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-3 text-slate-500 dark:text-slate-400">
                      No hay dias para mostrar en este mes.
                    </td>
                  </tr>
                ) : (
                  monthSummary.map((row) => {
                    const isSelected = row.dateFolder === dateFolder;
                    const isBalanced =
                      row.faltanActas === 0 && row.sobranActas === 0 && row.errorCount === 0 && row.inboxCount === 0;
                    return (
                      <tr
                        key={row.dateFolder}
                        onClick={() => {
                          setDateFolder(row.dateFolder);
                          setSelectedDateFolder(row.dateFolder);
                          setDateConfirmedForUpload(false);
                        }}
                        className={`cursor-pointer border-t border-slate-200 dark:border-slate-700 ${
                          isSelected ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="p-2 font-medium">{dayjs(row.dateFolder).format("DD/MM/YYYY")}</td>
                        <td className="p-2">{row.instalacionesDia}</td>
                        <td className="p-2">{row.actasOkDia}</td>
                        <td className="p-2 text-rose-700 dark:text-rose-300">{row.faltanActas}</td>
                        <td className="p-2 text-amber-700 dark:text-amber-300">{row.sobranActas}</td>
                        <td className="p-2">{row.instalacionesSinActa}</td>
                        <td className="p-2">{row.errorCount}</td>
                        <td className="p-2">{row.inboxCount}</td>
                        <td className="p-2">
                          {isBalanced ? <Badge tone="ok">Cuadra</Badge> : <Badge tone="error">Revisar</Badge>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {selectedDateFolder ? (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-800/60 dark:bg-blue-900/15">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">Detalle del dia {displayDate}</div>
                <div className="text-xs text-blue-800/80 dark:text-blue-200/80">
                  La operacion diaria queda igual que antes. Puedes volver al resumen mensual cuando quieras.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateFolder(null)}
                className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
              >
                Volver al resumen mensual
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</label>
              <input
                type="date"
                value={dateFolder}
                onChange={(e) => {
                  const next = e.target.value;
                  setDateFolder(next);
                  setSelectedDateFolder(next);
                  const nextMonth = dayjs(next, "YYYY-MM-DD", true).format("YYYY-MM");
                  if (/^\d{4}-\d{2}$/.test(nextMonth) && nextMonth !== monthFilter) setMonthFilter(nextMonth);
                  setDateConfirmedForUpload(false);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) {
                      toast.error("Fecha invalida");
                      return;
                    }
                    setDateConfirmedForUpload(true);
                    toast.success(`Fecha validada: ${dateFolder}`);
                  }}
                  className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-900/25 dark:text-blue-200"
                >
                  Validar fecha
                </button>
                {dateConfirmedForUpload ? <Badge tone="ok">Fecha validada</Badge> : <Badge tone="error">Validacion pendiente</Badge>}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Actas PDF</label>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf"
                onChange={(e) => addFiles(e.target.files)}
                className="mt-1 block w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={uploadAll}
                disabled={uploading || files.length === 0 || !dateConfirmedForUpload}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Procesando..." : "Subir y procesar"}
              </button>
              <button
                type="button"
                onClick={() => setFiles([])}
                disabled={uploading || files.length === 0}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="info">Fecha: {displayDate}</Badge>
            <Badge tone={dateConfirmedForUpload ? "ok" : "error"}>
              Fecha {dateConfirmedForUpload ? "validada" : "sin validar"}
            </Badge>
            <Badge tone="info">Instalaciones dia: {list?.stats?.instalacionesDia ?? 0}</Badge>
            <Badge tone="ok">Actas OK dia: {list?.stats?.actasOkDia ?? 0}</Badge>
            <Badge tone={pendingVsInstallationsCount > 0 ? "error" : "ok"}>
              Pendientes vs instalaciones: {pendingVsInstallationsCount}
            </Badge>
            <Badge tone={missingByActaCount > 0 ? "error" : "ok"}>
              Faltan por ACTA: {missingByActaCount}
            </Badge>
            <Badge tone={missingWithoutActaCount > 0 ? "error" : "ok"}>
              Sin ACTA en BD: {missingWithoutActaCount}
            </Badge>
            <Badge tone={(list?.stats?.sobranActas ?? 0) > 0 ? "error" : "ok"}>
              Sobran actas: {list?.stats?.sobranActas ?? 0}
            </Badge>
            <Badge tone={(list?.actaAudit?.summary?.okFueraFecha ?? 0) > 0 ? "error" : "ok"}>
              OK fuera de fecha: {list?.actaAudit?.summary?.okFueraFecha ?? 0}
            </Badge>
            <Badge tone={(list?.actaAudit?.summary?.okSinTrazabilidad ?? 0) > 0 ? "error" : "ok"}>
              OK sin trazabilidad: {list?.actaAudit?.summary?.okSinTrazabilidad ?? 0}
            </Badge>
            <Badge tone={(list?.actaAudit?.summary?.instalacionesSinActa ?? 0) > 0 ? "error" : "ok"}>
              Instalaciones sin ACTA: {list?.actaAudit?.summary?.instalacionesSinActa ?? 0}
            </Badge>
            <Badge>Por subir: {totals.count}</Badge>
            <Badge>Peso: {bytesToHuman(totals.totalBytes)}</Badge>
            <Badge tone="ok">OK: {list?.okFiles?.length ?? 0}</Badge>
            <Badge tone="error">ERROR: {list?.errorFiles?.length ?? 0}</Badge>
            <Badge>INBOX: {list?.inbox?.length ?? 0}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runCleanup}
              disabled={cleaningOld}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800/60 dark:bg-amber-900/25 dark:text-amber-200 dark:hover:bg-amber-900/35"
            >
              {cleaningOld ? "Limpiando..." : "Limpiar antiguos > 7 dias"}
            </button>
            <button
              type="button"
              onClick={runDayCleanup}
              disabled={cleaningDay}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-200 dark:hover:bg-rose-900/35"
            >
              {cleaningDay ? "Limpiando dia..." : "Limpiar dia seleccionado"}
            </button>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Para evitar errores, primero valida la fecha y recien despues sube los PDFs. La vista se actualiza automaticamente con un ritmo suave.
          </div>
          {pendingVsInstallationsCount > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-100">
              Pendientes para {displayDate}: {pendingVsInstallationsCount}. Revisa "Actas faltantes" para faltas con ACTA conocida y
              "Instalaciones sin ACTA" cuando la base no tiene ACTA registrada, por eso a veces falta 1 pero no aparece una acta especifica.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-900/20">
          <div className="border-b border-rose-200 px-3 py-2 text-sm font-semibold text-rose-900 dark:border-rose-800/60 dark:text-rose-100">
            Actas faltantes ({list?.actaAudit?.faltantes?.length ?? 0})
          </div>
          <div className="max-h-60 overflow-auto divide-y divide-rose-200 dark:divide-rose-800/50">
            {(list?.actaAudit?.faltantes || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay faltantes por acta para esta fecha.</div>
            ) : (
              (list?.actaAudit?.faltantes || []).map((item) => (
                <div key={`${item.id}_${item.acta}`} className="space-y-1 p-3 text-xs">
                  <div className="font-medium">Acta: {item.acta}</div>
                  <div>
                    Cliente esperado: {item.codigoCliente} - {item.cliente || "-"}
                  </div>
                  <div>Fecha base: {item.fechaBaseYmd || item.fechaOrdenYmd || item.fechaInstalacionYmd || "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-900/20">
          <div className="border-b border-amber-200 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:text-amber-100">
            Instalaciones sin ACTA ({list?.actaAudit?.sinActa?.length ?? 0})
          </div>
          <div className="max-h-60 overflow-auto divide-y divide-amber-200 dark:divide-amber-800/50">
            {(list?.actaAudit?.sinActa || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Todas las instalaciones del dia tienen ACTA registrada.</div>
            ) : (
              (list?.actaAudit?.sinActa || []).map((item) => (
                <div key={item.id} className="space-y-1 p-3 text-xs">
                  <div className="font-medium">ID: {item.id}</div>
                  <div>
                    Cliente: {item.codigoCliente || "-"} - {item.cliente || "-"}
                  </div>
                  <div>Fecha base: {item.fechaBaseYmd || item.fechaOrdenYmd || item.fechaInstalacionYmd || "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
            OK sin trazabilidad ({list?.actaAudit?.okSinTrazabilidad?.length ?? 0})
          </div>
          <div className="max-h-60 overflow-auto divide-y divide-slate-200 dark:divide-slate-700">
            {(list?.actaAudit?.okSinTrazabilidad || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Todos los OK tienen acta trazable.</div>
            ) : (
              (list?.actaAudit?.okSinTrazabilidad || []).map((item) => (
                <div key={item.fullPath} className="flex items-center justify-between gap-2 p-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.fileName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">No se pudo vincular a una acta confiable del indice.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => reprocessOkFile({ name: item.fileName, fullPath: item.fullPath, size: 0, updatedAt: "" })}
                    disabled={reprocessingOkPath === item.fullPath}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-900/25 dark:text-blue-200"
                  >
                    {reprocessingOkPath === item.fullPath ? "Reprocesando..." : "Reprocesar"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-900/20">
          <div className="border-b border-amber-300 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:text-amber-100">
            Actas sobrantes ({list?.actaAudit?.sobrantes?.length ?? 0})
          </div>
          <div className="max-h-60 overflow-auto divide-y divide-amber-300 dark:divide-amber-800/50">
            {(list?.actaAudit?.sobrantes || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay archivos sobrantes en OK.</div>
            ) : (
              (list?.actaAudit?.sobrantes || []).map((item) => (
                <div
                  key={item.fullPath}
                  className={`space-y-1 p-3 text-xs ${highlightedOkPath === item.fullPath ? "bg-amber-100/80 dark:bg-amber-900/30" : ""}`}
                >
                  <div className="font-medium">{item.fileName}</div>
                  <div>
                    Motivo:{" "}
                    {item.tipo === "duplicada"
                      ? `Acta duplicada${item.acta ? ` (${item.acta})` : ""}`
                      : item.tipo === "fuera_fecha"
                        ? `Fuera de fecha${item.acta ? ` (acta ${item.acta})` : ""}`
                        : "Sin trazabilidad en indice"}
                  </div>
                  {item.tipo === "duplicada" && (item.codigoCliente || item.cliente) ? (
                    <div>
                      Cliente relacionado: {item.codigoCliente || "-"} - {item.cliente || "-"}
                    </div>
                  ) : null}
                  {item.tipo === "duplicada" ? (
                    <div className="text-rose-700 dark:text-rose-200">
                      {looksLikeIndexedCopy(item.fileName)
                        ? "Sugerido para quitar: este duplicado fue renombrado con sufijo (1)."
                        : "Mantener con cuidado: este parece ser el original o una copia sin sufijo numerado."}
                    </div>
                  ) : null}
                  {item.tipo === "fuera_fecha" && (
                    <div>Fechas sugeridas: {item.fechasSugeridas?.join(", ") || "sin sugerencia"}</div>
                  )}
                  <div className="pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => focusOkFile(item.fullPath)}
                        className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
                      >
                        Ver en OK
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSobranteToSuggestedDate(item)}
                        disabled={
                          uploading ||
                          movingSobrantePath === item.fullPath ||
                          item.tipo !== "fuera_fecha" ||
                          Array.from(
                            new Set(
                              (item.fechasSugeridas || []).filter(
                                (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || "")) && String(x || "").trim() !== dateFolder
                              )
                            )
                          ).length !== 1
                        }
                        className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                      >
                        {movingSobrantePath === item.fullPath ? "Moviendo..." : "Mover a fecha sugerida"}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOkToError(item.fullPath)}
                        disabled={uploading || movingSobrantePath === item.fullPath}
                        className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                      >
                        {movingSobrantePath === item.fullPath ? "Moviendo..." : "Quitar de OK"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800/60">Archivos por subir</div>
          <div className="max-h-56 overflow-auto divide-y divide-slate-200 dark:divide-slate-700">
            {files.map((f) => (
              <div key={`${f.name}_${f.size}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="truncate">{f.name}</div>
                <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(f.size)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/60">
          <div className="border-b border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-100">
            Procesamiento por archivo
          </div>
          <div className="border-b border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/15 dark:text-blue-100">
            {activeQueueItem
              ? `En foco: ${activeQueueItem.fileName} (${activeQueueItem.status})`
              : "Sin archivo en cola"}
          </div>
          <div
            ref={queueContainerRef}
            className="max-h-80 overflow-auto divide-y divide-blue-100 dark:divide-blue-900/40"
          >
            {uploadQueue.map((q) => (
              <div
                key={q.id}
                ref={(el) => {
                  queueRowRefs.current[q.id] = el;
                }}
                className={`space-y-2 px-3 py-2 ${
                  q.id === activeQueueId && q.status === "processing"
                    ? "bg-blue-50/70 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800/60"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{q.fileName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(q.size)}</div>
                  </div>
                  <div className="shrink-0">
                    {q.status === "done" ? <Badge tone="ok">OK</Badge> : q.status === "error" ? <Badge tone="error">ERROR</Badge> : q.status === "processing" ? <Badge tone="info">Procesando</Badge> : <Badge>En cola</Badge>}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      q.status === "done"
                        ? "bg-emerald-500"
                        : q.status === "error"
                          ? "bg-rose-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.max(2, Math.min(100, q.progress))}%` }}
                  />
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{q.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastUpload && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800/60">Ultimo procesamiento</div>
          <div className="space-y-2 p-3 text-sm">
            <div>
              Total: <b>{lastUpload.summary.total}</b> | OK: <b className="text-emerald-600 dark:text-emerald-300">{lastUpload.summary.ok}</b> | ERROR: <b className="text-rose-600 dark:text-rose-300">{lastUpload.summary.error}</b>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800/80">
                  <tr>
                    <th className="p-2 text-left">Archivo</th>
                    <th className="p-2 text-left">Acta</th>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Fuente</th>
                    <th className="p-2 text-left">Tiempo</th>
                    <th className="p-2 text-left">Intentos</th>
                    <th className="p-2 text-left">Resultado</th>
                    <th className="p-2 text-left">Motivo</th>
                    <th className="p-2 text-left">Detalle</th>
                    <th className="p-2 text-left">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {lastUpload.uploaded.map((r) => (
                    <tr key={`${r.originalName}_${r.finalPath}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2">{r.originalName}</td>
                      <td className="p-2">{r.acta || "-"}</td>
                      <td className="p-2">
                        {r.status !== "ok" ? (
                          "-"
                        ) : auditInsideByPath.has(r.finalPath) ? (
                          <span className="text-emerald-600 dark:text-emerald-300">Dentro de fecha</span>
                        ) : auditOutsideByPath.has(r.finalPath) ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            Fuera: {auditOutsideByPath.get(r.finalPath)?.join(", ") || "sin sugerencia"}
                          </span>
                        ) : auditNoTraceByPath.has(r.finalPath) ? (
                          <span className="text-slate-500 dark:text-slate-300">Sin trazabilidad</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">{r.source || "-"}</td>
                      <td className="p-2">{typeof r.durationMs === "number" ? `${r.durationMs} ms` : "-"}</td>
                      <td className="p-2">{typeof r.attempts === "number" ? r.attempts : "-"}</td>
                      <td className="p-2">
                        <span className={r.status === "ok" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2">{reasonToLabel(r.reason, r.detail)}</td>
                      <td className="p-2">
                        <div>{r.detail}</div>
                        {!!r.trace?.length && (
                          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            {r.trace.map((t) => `${t.label}:${t.status}(${t.durationMs}ms)`).join(" | ")}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        {r.status === "error" && String(r.finalPath || "").includes("/error/") ? (
                          <button
                            type="button"
                            onClick={() => reprocessRigorous(r)}
                            disabled={uploading || reprocessingPath === r.finalPath}
                            className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-900/25 dark:text-blue-200"
                          >
                            {reprocessingPath === r.finalPath ? "Reanalizando..." : "Reanalizar riguroso"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-800/60 dark:bg-blue-900/15">
        <div className="flex items-center justify-between gap-2 border-b border-blue-200 px-3 py-2 dark:border-blue-800/60">
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            INBOX ({list?.inbox?.length ?? 0})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reprocessAllInboxFiles}
              disabled={bulkReprocessingInbox || (list?.inbox?.length ?? 0) === 0}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkReprocessingInbox ? "Procesando..." : "Procesar todos"}
            </button>
            <button
              type="button"
              onClick={deleteAllInboxFiles}
              disabled={bulkDeletingInbox || (list?.inbox?.length ?? 0) === 0}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
            >
              {bulkDeletingInbox ? "Quitando..." : "Quitar todos"}
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-auto divide-y divide-blue-200 dark:divide-blue-800/50">
          {(list?.inbox || []).length === 0 ? (
            <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay archivos en INBOX para esta fecha.</div>
          ) : (
            (list?.inbox || []).map((item) => (
              <div key={item.fullPath} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(item.size)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => download(item.fullPath, "view")}
                    className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
                  >
                    Ver PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => download(item.fullPath)}
                    className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-900 dark:text-blue-200"
                  >
                    Descargar
                  </button>
                  <button
                    type="button"
                    onClick={() => reprocessInboxFile(item)}
                    disabled={reprocessingInboxPath === item.fullPath || movingPath === item.fullPath}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reprocessingInboxPath === item.fullPath ? "Reprocesando..." : "Reprocesar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteInboxFile(item.fullPath)}
                    disabled={movingPath === item.fullPath || reprocessingInboxPath === item.fullPath}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                  >
                    {movingPath === item.fullPath ? "Eliminando..." : "Quitar de INBOX"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div ref={okSectionRef} className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-900/20">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-200 px-3 py-2 dark:border-emerald-800/60">
            <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Resultado final OK ({list?.okFiles?.length ?? 0})
            </div>
            <button
              type="button"
              onClick={downloadOkZip}
              disabled={downloadingOkZip || (list?.okFiles?.length ?? 0) === 0}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
            >
              {downloadingOkZip ? "Preparando ZIP..." : "Descargar ZIP"}
            </button>
          </div>
          <div className="max-h-[460px] overflow-auto divide-y divide-emerald-200 dark:divide-emerald-800/50">
            {(list?.okFiles || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay archivos OK para esta fecha.</div>
            ) : (
              (list?.okFiles || []).map((item) => (
                <div
                  key={item.fullPath}
                  ref={(el) => {
                    okRowRefs.current[item.fullPath] = el;
                  }}
                  className={`flex items-center justify-between gap-2 p-3 text-sm ${
                    highlightedOkPath === item.fullPath
                      ? "bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-900/25 dark:ring-amber-700"
                      : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(item.size)}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                      {auditDuplicateByPath.has(item.fullPath) ? (
                        <>
                          <Badge tone="error">Duplicado</Badge>
                          {auditDuplicateByPath.get(item.fullPath)?.suggestedToRemove ? <Badge tone="error">Quitar este (1)</Badge> : null}
                        </>
                      ) : auditOutsideByPath.has(item.fullPath) ? (
                        <Badge tone="error">Fuera de fecha</Badge>
                      ) : auditNoTraceByPath.has(item.fullPath) ? (
                        <Badge tone="neutral">Sin trazabilidad</Badge>
                      ) : auditInsideByPath.has(item.fullPath) ? (
                        <Badge tone="ok">Validado en fecha</Badge>
                      ) : (
                        <Badge tone="neutral">Sin clasificacion</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => download(item.fullPath, "view")}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
                    >
                      Ver PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => download(item.fullPath)}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOkToError(item.fullPath)}
                      disabled={movingSobrantePath === item.fullPath || reprocessingOkPath === item.fullPath}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                    >
                      {movingSobrantePath === item.fullPath ? "Moviendo..." : "Quitar de OK"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-900/20">
          <div className="flex items-center justify-between gap-2 border-b border-rose-200 px-3 py-2 dark:border-rose-800/60">
            <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">
              Resultado final ERROR ({list?.errorFiles?.length ?? 0})
            </div>
            <button
              type="button"
              onClick={moveAllErrorToInbox}
              disabled={bulkMovingErrorToInbox || (list?.errorFiles?.length ?? 0) === 0}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {bulkMovingErrorToInbox ? "Moviendo..." : "Mover todos a INBOX"}
            </button>
          </div>
          <div className="max-h-[460px] overflow-auto divide-y divide-rose-200 dark:divide-rose-800/50">
            {(list?.errorFiles || []).length === 0 ? (
              <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay archivos ERROR para esta fecha.</div>
            ) : (
              (list?.errorFiles || []).map((item) => (
                <div key={item.fullPath} className="space-y-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(item.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => download(item.fullPath, "view")}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                    >
                      Ver PDF
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={manualCodigoDraft[item.fullPath] || ""}
                      onChange={(e) => setManualCodigoDraft((prev) => ({ ...prev, [item.fullPath]: e.target.value }))}
                      placeholder="Codigo cliente"
                      className="w-1/3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs dark:border-rose-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <input
                      value={manualClienteDraft[item.fullPath] || ""}
                      onChange={(e) => setManualClienteDraft((prev) => ({ ...prev, [item.fullPath]: e.target.value }))}
                      placeholder="Nombre cliente"
                      className="w-2/3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs dark:border-rose-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-rose-700/80 dark:text-rose-200/80">
                      Nombre final:{" "}
                      <b>
                        {String(manualCodigoDraft[item.fullPath] || "").trim() || "CODIGO"} -{" "}
                        {String(manualClienteDraft[item.fullPath] || "").trim() || "CLIENTE"}.pdf
                      </b>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveErrorToOk(item)}
                      disabled={movingPath === item.fullPath}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {movingPath === item.fullPath ? "Moviendo..." : "Mover a OK"}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => moveErrorToInbox(item.fullPath)}
                      disabled={movingPath === item.fullPath}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {movingPath === item.fullPath ? "Moviendo..." : "Quitar de ERROR"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        El sistema detecta el codigo de acta leyendo el contenido del PDF (barcode/texto) para renombrar automaticamente a{" "}
        <b>CODIGOCLIENTE - CLIENTE.pdf</b>. Si no encuentra datos, el archivo queda en ERROR para correccion manual.
      </div>
        </>
      ) : null}
    </div>
  );
}
