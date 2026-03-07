import { requireArea } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const LOGS_COL = "actas_renombrado_logs";
const WINDOW_DAYS = 7;
const MAX_ROWS = 1500;

type LogRow = {
  tsIso: string;
  fileName: string;
  status: "ok" | "error";
  source: string;
  reason: string;
  durationMs: number;
};

function toIso(v: any) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : "";
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return "";
}

function asPct(num: number, den: number) {
  if (!den) return "0.0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function asDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function dayKey(iso: string) {
  return String(iso || "").slice(0, 10);
}

function parsePositiveInt(raw: string | string[] | undefined, fallback: number, min: number, max: number) {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseYmd(raw: string | string[] | undefined, fallback: string) {
  const s = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function sanitizeSource(raw: string | string[] | undefined) {
  const s = String(Array.isArray(raw) ? raw[0] : raw || "").trim().toLowerCase();
  if (s === "det_engine" || s === "ai_pdf" || s === "pdf_text") return s;
  return "all";
}

export default async function AdminActasRenombrarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireArea("INSTALACIONES");
  const sp = (await searchParams) || {};

  const fallbackFromYmd = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fallbackToYmd = new Date().toISOString().slice(0, 10);
  const fromYmd = parseYmd(sp.from, fallbackFromYmd);
  const toYmd = parseYmd(sp.to, fallbackToYmd);
  const sourceFilter = sanitizeSource(sp.source);
  const fromIso = `${fromYmd}T00:00:00.000Z`;
  const toRangeIso = `${toYmd}T23:59:59.999Z`;
  const snap = await adminDb()
    .collection(LOGS_COL)
    .where("ts", ">=", fromIso)
    .where("ts", "<=", toRangeIso)
    .orderBy("ts", "desc")
    .limit(MAX_ROWS)
    .get();

  const rawRows: LogRow[] = snap.docs.map((d) => {
    const x = d.data() as any;
    return {
      tsIso: toIso(x?.ts),
      fileName: String(x?.fileName || ""),
      status: String(x?.status || "").toLowerCase() === "ok" ? "ok" : "error",
      source: String(x?.source || "").trim() || "-",
      reason: String(x?.reason || "").trim() || "-",
      durationMs: Number(x?.durationMs || 0),
    };
  });
  const rows =
    sourceFilter === "all" ? rawRows : rawRows.filter((r) => String(r.source || "").toLowerCase() === sourceFilter);

  const total = rows.length;
  const ok = rows.filter((r) => r.status === "ok").length;
  const error = total - ok;
  const detEngine = rows.filter((r) => r.source === "det_engine").length;
  const aiPdf = rows.filter((r) => r.source === "ai_pdf").length;
  const pdfText = rows.filter((r) => r.source === "pdf_text").length;

  const durations = rows.map((r) => r.durationMs).filter((n) => Number.isFinite(n) && n > 0);
  const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const topReasons = Array.from(
    rows.reduce((acc, r) => {
      const key = r.reason || "-";
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const byDay = Array.from(
    rows.reduce((acc, r) => {
      const key = dayKey(r.tsIso) || "sin-fecha";
      const curr = acc.get(key) || { total: 0, ok: 0, error: 0, det: 0, ai: 0 };
      curr.total += 1;
      if (r.status === "ok") curr.ok += 1;
      else curr.error += 1;
      if (r.source === "det_engine") curr.det += 1;
      if (r.source === "ai_pdf") curr.ai += 1;
      acc.set(key, curr);
      return acc;
    }, new Map<string, { total: number; ok: number; error: number; det: number; ai: number }>())
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7);

  const pageSize = parsePositiveInt(sp.pageSize, 50, 10, 200);
  const page = parsePositiveInt(sp.page, 1, 1, 9999);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedRows = rows.slice(start, start + pageSize);
  const qs = (nextPage: number) => {
    const p = new URLSearchParams();
    p.set("from", fromYmd);
    p.set("to", toYmd);
    p.set("source", sourceFilter);
    p.set("pageSize", String(pageSize));
    p.set("page", String(nextPage));
    return p.toString();
  };
  const prevHref = `/admin/actas_renombrar?${qs(Math.max(1, safePage - 1))}`;
  const nextHref = `/admin/actas_renombrar?${qs(Math.min(totalPages, safePage + 1))}`;

  return (
    <div className="space-y-5 p-6 text-slate-900 dark:text-slate-100">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Actas Renombrar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Resumen operativo. Fuente: <span className="font-mono">{LOGS_COL}</span>.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <form method="GET" className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-sm">
            Desde
            <input name="from" type="date" defaultValue={fromYmd} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            Hasta
            <input name="to" type="date" defaultValue={toYmd} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            Source
            <select name="source" defaultValue={sourceFilter} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="all">Todos</option>
              <option value="det_engine">det_engine</option>
              <option value="ai_pdf">ai_pdf</option>
              <option value="pdf_text">pdf_text</option>
            </select>
          </label>
          <label className="text-sm">
            Tamano pagina
            <select name="pageSize" defaultValue={String(pageSize)} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <input type="hidden" name="page" value="1" />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
              Aplicar filtros
            </button>
            <a
              href="/admin/actas_renombrar"
              className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Limpiar
            </a>
          </div>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold">{total}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="text-xs text-emerald-700 dark:text-emerald-300">OK</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{asPct(ok, total)}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 shadow-sm dark:border-rose-800 dark:bg-rose-900/20">
          <div className="text-xs text-rose-700 dark:text-rose-300">Error</div>
          <div className="mt-1 text-2xl font-semibold text-rose-700 dark:text-rose-300">{asPct(error, total)}</div>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 shadow-sm dark:border-cyan-800 dark:bg-cyan-900/20">
          <div className="text-xs text-cyan-700 dark:text-cyan-300">% det_engine</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-700 dark:text-cyan-300">{asPct(detEngine, total)}</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm dark:border-indigo-800 dark:bg-indigo-900/20">
          <div className="text-xs text-indigo-700 dark:text-indigo-300">% ai_pdf</div>
          <div className="mt-1 text-2xl font-semibold text-indigo-700 dark:text-indigo-300">{asPct(aiPdf, total)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Tiempo promedio</div>
          <div className="mt-1 text-2xl font-semibold">{asDuration(avgMs)}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 text-sm font-semibold">Tendencia por dia</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="p-2 text-left">Dia</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">OK</th>
                  <th className="p-2 text-right">Error</th>
                  <th className="p-2 text-right">%Det</th>
                  <th className="p-2 text-right">%IA</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="p-2">{k}</td>
                    <td className="p-2 text-right">{v.total}</td>
                    <td className="p-2 text-right">{v.ok}</td>
                    <td className="p-2 text-right">{v.error}</td>
                    <td className="p-2 text-right">{asPct(v.det, v.total)}</td>
                    <td className="p-2 text-right">{asPct(v.ai, v.total)}</td>
                  </tr>
                ))}
                {!byDay.length ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      Sin datos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 text-sm font-semibold">Top motivos</div>
          <div className="space-y-2">
            {topReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                <span className="truncate">{reason}</span>
                <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{count}</span>
              </div>
            ))}
            {!topReasons.length ? <div className="text-sm text-slate-500">Sin datos.</div> : null}
            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400">
              Fuentes: det_engine={detEngine}, ai_pdf={aiPdf}, pdf_text={pdfText}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
          <div className="font-semibold">Ultimos eventos</div>
          <div className="text-xs text-slate-500">
            Pagina {safePage}/{totalPages} · {total} registros
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-left">
                <th className="p-2">Fecha</th>
                <th className="p-2">Archivo</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Source</th>
                <th className="p-2">Tiempo</th>
                <th className="p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, idx) => (
                <tr key={`${r.tsIso}_${idx}`} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-2 whitespace-nowrap">{r.tsIso ? new Date(r.tsIso).toLocaleString("es-PE") : "-"}</td>
                  <td className="p-2">{r.fileName || "-"}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2 font-mono">{r.source}</td>
                  <td className="p-2">{asDuration(r.durationMs)}</td>
                  <td className="p-2">{r.reason}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    Sin eventos para el rango seleccionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
          <a
            href={prevHref}
            className={`rounded-lg border px-3 py-1.5 ${safePage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
          >
            Anterior
          </a>
          <div className="text-xs text-slate-500">Mostrando {pagedRows.length} de {total}</div>
          <a
            href={nextHref}
            className={`rounded-lg border px-3 py-1.5 ${safePage >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
          >
            Siguiente
          </a>
        </div>
      </section>
    </div>
  );
}
