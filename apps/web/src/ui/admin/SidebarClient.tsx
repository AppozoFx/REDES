"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
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
  if (group === "ADMIN") return "Administracion";
  return "Areas";
}

function groupBadge(group: GroupKey) {
  if (group === "GENERAL") return "GN";
  if (group === "ADMIN") return "AD";
  return "AR";
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
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState<GroupKey>("GENERAL");
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

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? "5rem" : "16rem" }}
      transition={SIDEBAR_SPRING}
      className="h-dvh shrink-0 overflow-x-hidden border-r border-[rgba(15,23,42,.08)] bg-gradient-to-b from-white to-slate-50/70 shadow-[0_6px_20px_rgba(15,23,42,.05)]"
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
                <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-white shadow-[0_6px_18px_rgba(48,81,140,.2)] ring-1 ring-[var(--line)]">
                  <Image src="/img/logo.png" alt="Logo REDES" width={26} height={26} className="h-6 w-6 object-contain" />
                </span>
                <span className="text-sm font-semibold text-[var(--brand-ink)]">Admin</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-xl border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            <span className={`inline-block transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M12.78 4.22a.75.75 0 010 1.06L8.06 10l4.72 4.72a.75.75 0 11-1.06 1.06l-5.25-5.25a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" />
              </svg>
            </span>
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mb-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-slate-500"
            >
              Ruta actual: <span className="font-semibold text-[var(--brand-ink)]">{activeLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {collapsed && (
          <div className="group relative mb-2">
            <div className="flex h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[11px] font-semibold text-[var(--brand-ink)]">
              EN
            </div>
            <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
              Ruta actual: {activeLabel}
            </div>
          </div>
        )}

        <nav className="space-y-2 overflow-x-hidden overflow-y-auto">
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
                    className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                      activeInside
                        ? "bg-[#e7efff] font-semibold text-[#1f3154] ring-1 ring-[#bfd1f1]"
                        : "text-[var(--muted-ink)] hover:bg-white/70 hover:text-[#30518c]"
                    }`}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-sm font-semibold">
                      {groupBadge(group)}
                    </span>
                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={FADE_SLIDE}
                          className="flex-1 truncate"
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
                          className="text-xs text-[var(--muted-ink)]"
                        >
                          v
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  {collapsed && (
                    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
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
                      <div className="ml-4 border-l border-[var(--line)] pl-2">
                        {list.map((it) => {
                          const active = pathname === it.href;
                          return (
                            <Link
                              key={it.href}
                              href={it.href}
                              className={`relative mt-1 flex items-center rounded-xl px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                                active
                                  ? "bg-[#dbe7ff] font-bold text-[#1f3154] ring-1 ring-[#9db8ea] shadow-[inset_0_0_0_1px_rgba(48,81,140,.08)]"
                                  : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[#30518c]"
                              }`}
                            >
                              {active && (
                                <span className="absolute -left-[9px] h-7 w-2 rounded-full bg-[#30518c] shadow-[0_0_14px_rgba(48,81,140,.65)]" />
                              )}
                              <span className="truncate">{it.label}</span>
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

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-slate-500"
            >
              Areas: {areas.join(", ") || "(none)"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
