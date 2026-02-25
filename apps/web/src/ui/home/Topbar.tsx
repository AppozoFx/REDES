"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ServerSession } from "@/core/auth/session";
import { NotificationsBell } from "@/ui/common/NotificationsBell";

function shortName(full: string, fallback: string) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function initialsFromName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return String(fallback || "").slice(0, 2).toUpperCase();
  const a = (parts[0] || "").charAt(0);
  const b = (parts[1] || "").charAt(0);
  const init = `${a}${b}`.trim().toUpperCase();
  return init || String(fallback || "").slice(0, 2).toUpperCase();
}

export default function HomeTopbar({ session }: { session: ServerSession }) {
  const [nombreCorto, setNombreCorto] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) return;
        const nombre = shortName(String(body?.nombre || ""), session.uid);
        if (mounted) setNombreCorto(nombre);
      } catch {
        // fallback silencioso al uid
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session.uid]);

  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  const identidad = useMemo(() => nombreCorto || session.uid, [nombreCorto, session.uid]);
  const initials = useMemo(() => initialsFromName(identidad, session.uid), [identidad, session.uid]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Panel Home</div>

      <div className="flex items-center gap-3">
        <NotificationsBell uid={session.uid} />

        <div ref={menuRef} className="relative z-[160]">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#30518c] text-xs font-semibold text-white shadow-[0_8px_20px_rgba(48,81,140,.32)] ring-2 ring-white"
            title={identidad}
            aria-label="Abrir menu de usuario"
            aria-expanded={menuOpen}
          >
            {initials}
          </button>

          <div
            className={`absolute right-0 z-[200] mt-2 w-44 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all duration-180 ease-out dark:border-slate-700 dark:bg-slate-900 ${
              menuOpen
                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-95 opacity-0"
            }`}
          >
            <div className="mb-1 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#30518c] text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 text-xs font-medium text-slate-700 dark:text-slate-200">{identidad}</div>
            </div>
            <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
            <Link
              href="/home/perfil"
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setMenuOpen(false)}
            >
              Mi perfil
            </Link>
            {session.isAdmin ? (
              <Link
                href="/admin"
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setMenuOpen(false)}
              >
                Ir a Admin
              </Link>
            ) : null}
            <button
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30"
              onClick={async () => {
                setMenuOpen(false);
                await fetch("/api/auth/presencia", { method: "DELETE" });
                await fetch("/api/auth/session", { method: "DELETE" });
                window.location.href = "/login";
              }}
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

