"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { AdminNavItem } from "@/core/rbac/menu";

type GroupKey = "GENERAL" | "ADMIN" | "AREAS";

const GROUP_ORDER: GroupKey[] = ["GENERAL", "ADMIN", "AREAS"];
const SIDEBAR_SPRING = { type: "spring", stiffness: 260, damping: 28, mass: 0.8 } as const;
const FADE_SLIDE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

function getGroup(it: AdminNavItem): GroupKey {
  if (it.href === "/admin") return "GENERAL";
  if (it.adminOnly) return "ADMIN";
  return "AREAS";
}

function groupLabel(group: GroupKey) {
  if (group === "GENERAL") return "General";
  if (group === "ADMIN") return "Administración";
  return "Áreas";
}

function GroupIcon({ group }: { group: GroupKey }) {
  if (group === "GENERAL") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  }
  if (group === "ADMIN") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebarClient({
  items,
  areas,
}: {
  items: AdminNavItem[];
  areas: string[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [openGroup, setOpenGroup] = useState<GroupKey>("GENERAL");
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);
  const activeLabel = useMemo(() => {
    const exact = items.find((it) => pathname === it.href);
    if (exact) return exact.label;
    const byPrefix = [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((it) => pathname.startsWith(`${it.href}/`) || pathname.startsWith(it.href));
    return byPrefix?.label || "Inicio";
  }, [items, pathname]);

  const grouped = useMemo(() => {
    const out = new Map<GroupKey, AdminNavItem[]>();
    for (const g of GROUP_ORDER) out.set(g, []);
    for (const it of items) {
      const g = getGroup(it);
      out.set(g, [...(out.get(g) || []), it]);
    }
    return out;
  }, [items]);

  useEffect(() => {
    setNavigatingHref(null);
  }, [pathname]);

  const handleNavClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href === pathname) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setNavigatingHref(href);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? "5rem" : "16rem" }}
      transition={SIDEBAR_SPRING}
      className="h-dvh shrink-0 overflow-x-hidden border-r border-[rgba(15,23,42,.08)] bg-gradient-to-b from-white to-slate-50/70 shadow-[0_6px_20px_rgba(15,23,42,.05)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-950 dark:shadow-none"
      style={
        {
          "--brand": "#30518c",
          "--brand-soft": "rgba(48,81,140,.09)",
          "--brand-ink": "#2b3f66",
          "--muted-ink": "#475569",
          "--line": "rgba(15,23,42,.08)",
        } as React.CSSProperties
      }
    >
      <div className="flex h-full min-w-0 flex-col overflow-x-hidden p-2">

        {/* ── Logo / Collapse toggle ── */}
        <div className="mb-3 flex items-center justify-between">
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={FADE_SLIDE}
                className="flex items-center gap-2"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-white shadow-[0_6px_18px_rgba(48,81,140,.2)] ring-1 ring-[var(--line)] dark:bg-slate-800 dark:shadow-none">
                  <Image src="/img/logo.png" alt="Logo REDES" width={26} height={26} className="h-6 w-6 object-contain" />
                </span>
                <span className="text-sm font-semibold text-[var(--brand-ink)]">Admin</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-xl border border-[var(--line)] p-1.5 text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 dark:hover:bg-slate-800"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            <svg
              viewBox="0 0 20 20"
              className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12.78 4.22a.75.75 0 010 1.06L8.06 10l4.72 4.72a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" />
            </svg>
          </button>
        </div>

        {/* ── Ruta activa (expandido) ── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mb-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              Sección: <span className="font-semibold text-[var(--brand-ink)] dark:text-slate-200">{activeLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ruta activa (colapsado, tooltip) ── */}
        {collapsed && (
          <div className="group relative mb-2">
            <div className="flex h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[11px] font-bold text-[var(--brand-ink)] dark:bg-slate-800 dark:text-slate-200">
              {activeLabel.slice(0, 2).toUpperCase()}
            </div>
            <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
              {activeLabel}
            </div>
          </div>
        )}

        {/* ── Navegación ── */}
        <nav className="space-y-1.5 overflow-x-hidden overflow-y-auto">
          {GROUP_ORDER.map((group) => {
            const list = grouped.get(group) || [];
            if (!list.length) return null;
            const isOpen = openGroup === group;
            const activeInside = list.some((it) => isPathActive(pathname, it.href));

            return (
              <div key={group} className="relative">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (collapsed) {
                        setCollapsed(false);
                        setOpenGroup(group);
                        return;
                      }
                      setOpenGroup((p) => (p === group ? "GENERAL" : group));
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                      activeInside
                        ? "bg-[#e7efff] font-semibold text-[#1f3154] ring-1 ring-[#bfd1f1] dark:bg-[#1f3154]/40 dark:text-[#a8c4f0] dark:ring-[#30518c]/40"
                        : "text-[var(--muted-ink)] hover:bg-white/70 hover:text-[#30518c] dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] dark:border-slate-700 ${
                      activeInside ? "bg-[#30518c] text-white shadow-[0_4px_12px_rgba(48,81,140,.3)]" : "bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      <GroupIcon group={group} />
                    </span>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={FADE_SLIDE}
                          className="flex-1 truncate text-sm"
                        >
                          {groupLabel(group)}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, rotate: 0 }}
                          animate={{ opacity: 1, rotate: isOpen ? 180 : 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="shrink-0 text-[var(--muted-ink)]"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  {collapsed && (
                    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {groupLabel(group)}
                    </div>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {!collapsed && isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      layout
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mt-1 border-l-2 border-[var(--line)] pl-2 dark:border-slate-700">
                        {list.map((it) => {
                          const active = pathname === it.href;
                          return (
                            <Link
                              key={it.href}
                              href={it.href}
                              onClick={(e) => handleNavClick(e, it.href)}
                              className={`relative mt-0.5 flex items-center rounded-lg px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                                active
                                  ? "bg-[#dbe7ff] font-semibold text-[#1f3154] shadow-[inset_0_0_0_1px_rgba(48,81,140,.12)] dark:bg-[#1f3154]/50 dark:text-[#a8c4f0]"
                                  : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[#30518c] dark:hover:bg-slate-800/60"
                              }`}
                            >
                              {active && (
                                <span className="absolute -left-[9px] h-6 w-1.5 rounded-full bg-[#30518c] shadow-[0_0_10px_rgba(48,81,140,.6)]" />
                              )}
                              <span className="truncate">{it.label}</span>
                              {navigatingHref === it.href && (
                                <span
                                  className="ml-auto inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#30518c]/35 border-t-[#30518c]"
                                  aria-hidden="true"
                                />
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* ── Áreas (footer) ── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mt-auto pt-3"
            >
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Áreas con acceso</p>
                <div className="flex flex-wrap gap-1">
                  {areas.length ? areas.map((a) => (
                    <span key={a} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {a}
                    </span>
                  )) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">(ninguna)</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
