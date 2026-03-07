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

const MAX_FILES_PER_BATCH = 300;

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
  const [dateConfirmedForUpload, setDateConfirmedForUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [movingPath, setMovingPath] = useState<string | null>(null);
  const [cleaningOld, setCleaningOld] = useState(false);
  const [cleaningDay, setCleaningDay] = useState(false);
  const [downloadingOkZip, setDownloadingOkZip] = useState(false);
  const [reprocessingPath, setReprocessingPath] = useState<string | null>(null);
  const [manualCodigoDraft, setManualCodigoDraft] = useState<Record<string, string>>({});
  const [manualClienteDraft, setManualClienteDraft] = useState<Record<string, string>>({});
  const [list, setList] = useState<ListResponse | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queueRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    return { count: files.length, totalBytes };
  }, [files]);

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
      const res = await fetch(`/api/instalaciones/actas-dia/renombrar?dateFolder=${encodeURIComponent(dateFolder)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar archivos");
      setList(data);
    } catch (e: any) {
      if (!silent) toast.error(e?.message || "Error cargando datos");
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFolder]);

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
    const el = queueRowRefs.current[activeQueueId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeQueueId, uploadQueue]);

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
            const aiTag = p.useAi ? " [IA]" : "";
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
          const data = (await res.json()) as UploadResponse;
          if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo procesar archivo");
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
                        : `${row.reason}`,
                  }
                : x
            )
          );
          await refreshList(true);
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
          await refreshList(true);
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
      await refreshList(true);
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
      await refreshList(true);
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
      await refreshList(true);
    } catch (e: any) {
      toast.error(e?.message || "Error en reanalisis riguroso");
    } finally {
      setReprocessingPath(null);
    }
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
      await refreshList(true);
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
      await refreshList(true);
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
      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</label>
          <input
            type="date"
            value={dateFolder}
            onChange={(e) => {
              setDateFolder(e.target.value);
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
        <Badge tone="info">Fecha: {dateFolder}</Badge>
        <Badge tone={dateConfirmedForUpload ? "ok" : "error"}>
          Fecha {dateConfirmedForUpload ? "validada" : "sin validar"}
        </Badge>
        <Badge tone="info">Instalaciones dia: {list?.stats?.instalacionesDia ?? 0}</Badge>
        <Badge tone="ok">Actas OK dia: {list?.stats?.actasOkDia ?? 0}</Badge>
        <Badge tone={(list?.stats?.faltanActas ?? 0) > 0 ? "error" : "ok"}>
          Faltan actas: {list?.stats?.faltanActas ?? 0}
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
          <div className="max-h-80 overflow-auto divide-y divide-blue-100 dark:divide-blue-900/40">
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
                      <td className="p-2">{r.source || "-"}</td>
                      <td className="p-2">{typeof r.durationMs === "number" ? `${r.durationMs} ms` : "-"}</td>
                      <td className="p-2">{typeof r.attempts === "number" ? r.attempts : "-"}</td>
                      <td className="p-2">
                        <span className={r.status === "ok" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2">{r.reason}</td>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-900/20">
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
                <div key={item.fullPath} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{bytesToHuman(item.size)}</div>
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
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-900/20">
          <div className="border-b border-rose-200 px-3 py-2 text-sm font-semibold text-rose-900 dark:border-rose-800/60 dark:text-rose-100">
            Resultado final ERROR ({list?.errorFiles?.length ?? 0})
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
    </div>
  );
}


