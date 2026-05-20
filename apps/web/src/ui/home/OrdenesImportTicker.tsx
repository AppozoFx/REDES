"use client";

import { useEffect, useMemo, useState } from "react";

type ImportTickerItem = {
  at: string | null;
  byUid: string;
  byNombre: string;
  sourceLabel: string;
  title: string;
  message: string;
};

type BannerComunicadoItem = {
  id: string;
  titulo: string;
  cuerpo: string;
  linkUrl: string;
  linkLabel: string;
  prioridad: number;
  autoType: string;
};

type ImportTickerResponse = {
  ok: boolean;
  item: ImportTickerItem | null;
  comunicados?: BannerComunicadoItem[];
  error?: string;
};

function fmtDateTime(v: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  }).format(d);
}

export function OrdenesImportTicker() {
  const [item, setItem] = useState<ImportTickerItem | null>(null);
  const [comunicados, setComunicados] = useState<BannerComunicadoItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/ordenes/import/last", { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as ImportTickerResponse;
        if (!res.ok || !body?.ok) return;
        if (!cancelled) {
          setItem(body.item || null);
          setComunicados(Array.isArray(body.comunicados) ? body.comunicados : []);
        }
      } catch {}
    };

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const importText = useMemo(() => {
    if (!item) return "Ordenes: sin registro reciente de actualizacion";
    const by = item.byNombre || item.byUid || "Sistema";
    return `Ordenes actualizadas: ${fmtDateTime(item.at)}, por ${by} | ${item.sourceLabel}`;
  }, [item]);

  const segments = useMemo(
    () => [
      { id: "import-status", text: importText, href: "", hrefLabel: "" },
      ...comunicados.map((c) => ({
        id: c.id,
        text: c.titulo || c.cuerpo || "Comunicado",
        href: c.linkUrl || "",
        hrefLabel: c.linkLabel || "",
      })),
    ],
    [importText, comunicados]
  );

  const repeatedSegments = useMemo(() => [...segments, ...segments], [segments]);
  const hasSecondaryItems = comunicados.length > 0;
  const importOnlyLoopText = useMemo(
    () => `${importText} • ${importText} • ${importText} • ${importText} • `,
    [importText]
  );

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-amber-50 shadow-sm dark:border-amber-800/70 dark:from-amber-950/30 dark:via-slate-900 dark:to-amber-950/30">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            Avisos
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {hasSecondaryItems ? (
              <div className="ticker-track flex items-center whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200">
                {repeatedSegments.map((segment, index) => (
                  <span key={`${segment.id}-${index}`} className="inline-flex items-center pr-8">
                    <span>{segment.text}</span>
                    {segment.href ? (
                      <a
                        className="ml-2 rounded-full border border-amber-300/80 bg-white/70 px-2 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-700/70 dark:bg-slate-900/70 dark:text-amber-300 dark:hover:bg-amber-950/40"
                        href={segment.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {segment.hrefLabel || "Abrir"}
                      </a>
                    ) : null}
                    <span className="ml-4 text-amber-500/70 dark:text-amber-400/60">•</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="ticker-track whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="inline-block pr-10">{importOnlyLoopText}</span>
                <span className="inline-block pr-10" aria-hidden="true">
                  {importOnlyLoopText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ticker-track {
          width: max-content;
          animation: ordenes-ticker 34s linear infinite;
          will-change: transform;
        }

        @keyframes ordenes-ticker {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </>
  );
}
