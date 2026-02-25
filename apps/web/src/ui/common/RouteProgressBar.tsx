"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function isInternalHref(href: string) {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  try {
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function RouteProgressBar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const finishRef = useRef<number | null>(null);

  useEffect(() => {
    const stop = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setProgress(100);
      if (finishRef.current) window.clearTimeout(finishRef.current);
      finishRef.current = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    };
    stop();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (finishRef.current) window.clearTimeout(finishRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search?.toString()]);

  useEffect(() => {
    const start = () => {
      if (timerRef.current) return;
      if (finishRef.current) window.clearTimeout(finishRef.current);
      setVisible(true);
      setProgress(12);
      timerRef.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          const step = p < 35 ? 10 : p < 70 ? 5 : 2;
          return Math.min(90, p + step);
        });
      }, 120);
    };

    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!el) return;
      if (el.target === "_blank") return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const href = el.getAttribute("href") || "";
      if (!isInternalHref(href)) return;
      const current = window.location.pathname + window.location.search + window.location.hash;
      const next = new URL(href, window.location.origin);
      const nextFull = next.pathname + next.search + next.hash;
      if (current === nextFull) return;
      start();
    };

    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div
      className={`pointer-events-none fixed left-0 right-0 top-0 z-[220] transition-opacity duration-150 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      <div
        className="h-[3px] bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-500 shadow-[0_0_12px_rgba(37,99,235,.45)] transition-[width] duration-200 ease-out dark:from-sky-400 dark:via-blue-500 dark:to-indigo-400"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

