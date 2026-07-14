"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { ServerSession } from "@/core/auth/session";
import { buildHomeNav } from "@/core/rbac/buildHomeNav";
import { useUserIdentity } from "@/ui/common/UserProvider";

type GroupKey =
  | "INSTALACIONES"
  | "GARANTIAS"
  | "MANTENIMIENTO"
  | "ORDENES"
  | "INCONCERT"
  | "GESTION"
  | "SUPERVISION"
  | "GERENCIA"
  | "ADMINISTRACION"
  | "ALMACEN";

const GROUP_ORDER: GroupKey[] = [
  "INSTALACIONES",
  "GARANTIAS",
  "MANTENIMIENTO",
  "ORDENES",
  "INCONCERT",
  "GESTION",
  "SUPERVISION",
  "GERENCIA",
  "ADMINISTRACION",
  "ALMACEN",
];

const SIDEBAR_SPRING = { type: "tween", ease: "easeOut", duration: 0.2 } as const;
const FADE_SLIDE = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function getGroup(href: string): GroupKey {
  if (
    href === "/home/instalaciones" ||
    href === "/home/instalaciones/dashboard" ||
    href === "/home/instalaciones/materiales" ||
    href === "/home/instalaciones/detalle" ||
    href === "/home/instalaciones/actas-dia"
  ) {
    return "INSTALACIONES";
  }
  if (href === "/home/garantias" || href.startsWith("/home/garantias/")) {
    return "GARANTIAS";
  }
  if (href.startsWith("/home/ordenes/")) return "ORDENES";
  if (href.startsWith("/home/inconcert/")) return "INCONCERT";
  if (href === "/home/mantenimiento" || href.startsWith("/home/mantenimiento/")) {
    return "MANTENIMIENTO";
  }
  if (
    href === "/home/supervision" ||
    href === "/home/supervisores" ||
    href === "/home/instalaciones/asignacion-supervisores" ||
    href === "/home/instalaciones/distribucion-zonas"
  ) {
    return "SUPERVISION";
  }
  if (
    href === "/home/jefatura" ||
    href === "/home/gerencia/coordinadores" ||
    href === "/home/gerencia/orden-compra" ||
    href === "/home/gerencia/ordenes-compra" ||
    href === "/home/gerencia/validacion-win"
  ) {
    return "GERENCIA";
  }
  if (
    href === "/home/instalaciones/asistencia" ||
    href === "/home/instalaciones/asistencia-programada" ||
    href === "/home/instalaciones/asignacion-gestores" ||
    href === "/home/instalaciones/asistencia/resumen" ||
    href === "/home/rrhh/gestor-jornadas" ||
    href === "/home/supervisores/asistencia" ||
    href === "/home/cuadrillas/gestion" ||
    href === "/home/tecnicos/gestion" ||
    href === "/home/cuadrillas/cierre-winbo" ||
    href === "/home/zonas"
  ) {
    return "GESTION";
  }
  if (href === "/home/usuarios" || href === "/home/cuadrillas")
    return "ADMINISTRACION";
  if (
    href === "/home/instalaciones/actas" ||
    href === "/home/equipos/import" ||
    href === "/home/materiales" ||
    href === "/home/transferencias/instalaciones/despacho" ||
    href === "/home/transferencias/instalaciones/devoluciones" ||
    href === "/home/transferencias/instalaciones/reposicion" ||
    href === "/home/transferencias/instalaciones/tecnicos-materiales" ||
    href === "/home/transferencias/instalaciones/despacho-personal" ||
    href === "/home/transferencias/instalaciones/devoluciones-personal" ||
    href === "/home/transferencias/instalaciones/transferencias-internas" ||
    href === "/home/transferencias/instalaciones/equipos" ||
    href === "/home/transferencias/instalaciones/stock-equipos" ||
    href === "/home/transferencias/instalaciones/stock-personal" ||
    href === "/home/transferencias/instalaciones/predespacho" ||
    href === "/home/transferencias/instalaciones/auditoria" ||
    href === "/home/ventas" ||
    href === "/home/ventas/instalaciones/despacho"
  ) {
    return "ALMACEN";
  }
  if (href.startsWith("/home/transferencias/mantenimiento/") || href.startsWith("/home/ventas/mantenimiento/")) {
    return "MANTENIMIENTO";
  }
  return "MANTENIMIENTO";
}

function groupBadge(group: GroupKey) {
  if (group === "INSTALACIONES") return "IN";
  if (group === "GARANTIAS") return "GA";
  if (group === "MANTENIMIENTO") return "MA";
  if (group === "ORDENES") return "OR";
  if (group === "INCONCERT") return "IC";
  if (group === "GESTION") return "GE";
  if (group === "SUPERVISION") return "SU";
  if (group === "GERENCIA") return "GR";
  if (group === "ADMINISTRACION") return "AD";
  if (group === "ALMACEN") return "AL";
  return "MA";
}

const ALMACEN_SUBGROUP: Record<string, string> = {
  "/home/materiales": "CATÁLOGO",
  "/home/equipos/import": "CATÁLOGO",
  "/home/transferencias/instalaciones/predespacho": "MOVIMIENTOS",
  "/home/transferencias/instalaciones/despacho": "MOVIMIENTOS",
  "/home/transferencias/instalaciones/devoluciones": "MOVIMIENTOS",
  "/home/transferencias/instalaciones/reposicion": "MOVIMIENTOS",
  "/home/transferencias/instalaciones/despacho-personal": "PERSONAL",
  "/home/transferencias/instalaciones/devoluciones-personal": "PERSONAL",
  "/home/transferencias/instalaciones/transferencias-internas": "PERSONAL",
  "/home/transferencias/instalaciones/tecnicos-materiales": "PERSONAL",
  "/home/transferencias/instalaciones/stock-equipos": "INVENTARIO",
  "/home/transferencias/instalaciones/stock-personal": "INVENTARIO",
  "/home/transferencias/instalaciones/equipos": "INVENTARIO",
  "/home/transferencias/instalaciones/auditoria": "INVENTARIO",
  "/home/instalaciones/actas": "DOCUMENTOS",
  "/home/ventas": "DOCUMENTOS",
  "/home/ventas/instalaciones/despacho": "DOCUMENTOS",
};

const ALMACEN_SUBGROUP_ORDER = ["CATÁLOGO", "MOVIMIENTOS", "PERSONAL", "INVENTARIO", "DOCUMENTOS"];

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function HomeSidebar({ session }: { session: ServerSession }) {
  const pathname = usePathname();
  const itemsRaw = useMemo(() => buildHomeNav(session), [session]);
  const [openGroup, setOpenGroup] = useState<GroupKey>("INSTALACIONES");
  const [collapsed, setCollapsed] = useState(true);
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);
  const { user } = useUserIdentity();

  const items = useMemo(() => {
    return itemsRaw.filter((it) => it.href !== "/home/perfil");
  }, [itemsRaw]);

  const fixedTop = useMemo(() => {
    return items.filter(
      (it) => it.href === "/home" || it.href === "/home/comunicados" || it.href === "/home/status"
    );
  }, [items]);

  const grouped = useMemo(() => {
    const out = new Map<GroupKey, typeof items>();
    for (const g of GROUP_ORDER) out.set(g, []);
    for (const it of items) {
      if (it.href === "/home" || it.href === "/home/comunicados" || it.href === "/home/status") continue;
      const g = getGroup(it.href);
      out.set(g, [...(out.get(g) || []), it]);
    }
    return out;
  }, [items]);

  const identity = shortName(String(user?.nombre || ""), session.uid) || session.uid;

  const activeLabel = useMemo(() => {
    const exact = items.find((it) => pathname === it.href);
    if (exact) return exact.label;
    const byPrefix = [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((it) => pathname.startsWith(`${it.href}/`) || pathname.startsWith(it.href));
    return byPrefix?.label || "Inicio";
  }, [items, pathname]);

  // Auto-seleccionar el grupo activo cuando cambia la ruta (no cuando cambia items)
  useEffect(() => {
    const nonFixed = itemsRaw.filter(
      (it) => it.href !== "/home" && it.href !== "/home/comunicados" && it.href !== "/home/status"
    );
    const active = nonFixed.find((it) => isPathActive(pathname, it.href));
    if (active) setOpenGroup(getGroup(active.href));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className="relative z-10 h-dvh shrink-0 overflow-x-hidden border-r border-[rgba(15,23,42,.08)] bg-gradient-to-b from-white to-slate-50/70 shadow-[2px_0_20px_rgba(15,23,42,.07)] dark:border-slate-700 dark:from-slate-900 dark:to-slate-950 dark:shadow-none"
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

        {/* ── Logo / identidad ── */}
        <div className="mb-3 flex h-10 items-center gap-2 px-1">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-[0_4px_14px_rgba(48,81,140,.18)] ring-1 ring-[var(--line)] dark:bg-slate-800 dark:shadow-none">
            <Image src="/img/logo.png" alt="Logo REDES" width={26} height={26} className="h-6 w-6 object-contain" />
          </span>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={FADE_SLIDE}
                className="min-w-0"
              >
                <div className="text-sm font-semibold text-[var(--brand-ink)]">Home</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{identity}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Ruta activa expandido ── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mb-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              Ruta actual:{" "}
              <span className="font-semibold text-[var(--brand-ink)]">{activeLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ruta activa colapsado ── */}
        {collapsed && (
          <div className="group relative mb-2">
            <div className="flex h-10 w-full items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[11px] font-semibold text-[var(--brand-ink)] dark:bg-slate-800 dark:text-slate-200">
              {activeLabel.slice(0, 2).toUpperCase()}
            </div>
            <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
              {activeLabel}
            </div>
          </div>
        )}

        {/* ── Items fijos: Inicio, Comunicados ── */}
        <nav className="mb-2 space-y-1">
          {fixedTop.map((it) => {
            const active = pathname === it.href;
            return (
              <div key={it.key} className="group relative">
                <Link
                  href={it.href}
                  onClick={(e) => handleNavClick(e, it.href)}
                  className={`relative flex items-center rounded-xl px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                    active
                      ? "bg-[#dbe7ff] font-bold text-[#1f3154] ring-1 ring-[#9db8ea] shadow-[inset_0_0_0_1px_rgba(48,81,140,.08)]"
                      : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[#30518c]"
                  }`}
                >
                  {active && (
                    <span className="absolute -left-[9px] h-7 w-2 rounded-full bg-[#30518c] shadow-[0_0_14px_rgba(48,81,140,.65)]" />
                  )}
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-sm font-semibold dark:bg-slate-800">
                    {it.label.slice(0, 2).toUpperCase()}
                  </span>
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={FADE_SLIDE}
                        className="ml-2 truncate"
                      >
                        {it.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {navigatingHref === it.href && (
                    <span
                      className="ml-auto inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#30518c]/35 border-t-[#30518c]"
                      aria-hidden="true"
                    />
                  )}
                </Link>

                {collapsed && (
                  <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    {it.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Grupos acordeón ── */}
        <nav className="space-y-1 overflow-x-hidden overflow-y-auto">
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
                      setOpenGroup((p) => (p === group ? "INSTALACIONES" : group));
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                      activeInside
                        ? "bg-[#e7efff] font-semibold text-[#1f3154] ring-1 ring-[#bfd1f1]"
                        : "text-[var(--muted-ink)] hover:bg-white/70 hover:text-[#30518c]"
                    }`}
                  >
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                      activeInside
                        ? "border-[#9db8ea] bg-[#30518c] text-white shadow-[0_4px_12px_rgba(48,81,140,.3)]"
                        : "border-[var(--line)] bg-white text-[var(--brand-ink)] dark:bg-slate-800"
                    }`}>
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
                          {group}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
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
                    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {group}
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
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mt-0.5 border-l-2 border-[var(--line)] pl-2">
                        {group === "ALMACEN" ? (
                          ALMACEN_SUBGROUP_ORDER.map((sg) => {
                            const sgItems = list.filter((it) => ALMACEN_SUBGROUP[it.href] === sg);
                            if (!sgItems.length) return null;
                            return (
                              <div key={sg}>
                                <p className="mt-2 mb-0.5 px-2.5 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                  {sg}
                                </p>
                                {sgItems.map((it) => {
                                  const active = pathname === it.href;
                                  return (
                                    <Link
                                      key={it.key}
                                      href={it.href}
                                      onClick={(e) => handleNavClick(e, it.href)}
                                      className={`relative mt-0.5 flex items-center rounded-lg px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                                        active
                                          ? "bg-[#dbe7ff] font-semibold text-[#1f3154] shadow-[inset_0_0_0_1px_rgba(48,81,140,.12)]"
                                          : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[#30518c]"
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
                            );
                          })
                        ) : (
                          list.map((it) => {
                            const active = pathname === it.href;
                            return (
                              <Link
                                key={it.key}
                                href={it.href}
                                onClick={(e) => handleNavClick(e, it.href)}
                                className={`relative mt-0.5 flex items-center rounded-lg px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/45 ${
                                  active
                                    ? "bg-[#dbe7ff] font-semibold text-[#1f3154] shadow-[inset_0_0_0_1px_rgba(48,81,140,.12)]"
                                    : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[#30518c]"
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
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* ── Áreas de acceso (footer) ── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={FADE_SLIDE}
              className="mt-auto pt-3"
            >
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Áreas</p>
                {(session.access.areas || []).join(", ") || "(ninguna)"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
