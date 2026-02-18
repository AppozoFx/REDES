"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

type SubItem = {
  id: string;
  label: string;
};

type GroupItem = {
  id: string;
  label: string;
  icon: string;
  items: SubItem[];
};

const GROUPS: GroupItem[] = [
  {
    id: "instalaciones",
    label: "Instalaciones",
    icon: "🧩",
    items: [
      { id: "inst-list", label: "Instalaciones" },
      { id: "inst-mat", label: "Instalaciones: Materiales" },
      { id: "inst-det", label: "Instalaciones: Detalle" },
    ],
  },
  {
    id: "ordenes",
    label: "Órdenes",
    icon: "📦",
    items: [
      { id: "ord-import", label: "Órdenes: Importar" },
      { id: "ord-calls", label: "Órdenes: Llamadas" },
      { id: "ord-liq", label: "Órdenes: Liquidar" },
      { id: "ord-map", label: "Órdenes: Mapa" },
      { id: "ord-gar", label: "Órdenes: Garantías" },
    ],
  },
  {
    id: "almacen",
    label: "Almacén",
    icon: "🏬",
    items: [
      { id: "actas", label: "Recepción de Actas" },
      { id: "desp", label: "Despacho (Inst)" },
      { id: "dev", label: "Devoluciones (Inst)" },
      { id: "stock", label: "Stock de Equipos (Inst)" },
    ],
  },
];

const ease = [0.4, 0, 0.2, 1] as const;

export default function ModernAdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState<string>(GROUPS[0].id);
  const [activeItem, setActiveItem] = useState<string>(GROUPS[0].items[0].id);

  const cssVars = useMemo(
    () =>
      ({
        "--brand": "#30518c",
        "--accent": "#ff6413",
        "--brand-soft": "rgba(48,81,140,.09)",
        "--brand-ink": "#2b3f66",
        "--muted-ink": "#475569",
        "--line": "rgba(15,23,42,.08)",
      }) as React.CSSProperties,
    []
  );

  return (
    <motion.aside
      style={cssVars}
      initial={false}
      animate={{ width: collapsed ? "5rem" : "16rem" }}
      transition={{ duration: 0.3, ease }}
      className="h-screen shrink-0 border-r bg-gradient-to-b from-white to-slate-50/70 shadow-[0_6px_20px_rgba(15,23,42,.05)]"
    >
      <div className="flex h-full flex-col p-3">
        <div className="mb-3 flex items-center justify-between">
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="text-sm font-semibold text-[var(--brand-ink)]"
              >
                Panel Admin
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-xl border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted-ink)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/45"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {collapsed ? ">" : "<"}
          </button>
        </div>

        <nav className="space-y-2 overflow-y-auto">
          {GROUPS.map((group) => {
            const isOpen = openGroup === group.id;
            return (
              <div key={group.id} className="relative">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!collapsed) setOpenGroup((p) => (p === group.id ? "" : group.id));
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--muted-ink)] transition hover:bg-white/70 hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/45"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-xs">
                      {group.icon}
                    </span>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex-1 truncate"
                        >
                          {group.label}
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
                          ˅
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  {collapsed && (
                    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {group.label}
                    </div>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {!collapsed && isOpen && (
                    <motion.div
                      key={`${group.id}-submenu`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 border-l border-[var(--line)] pl-2">
                        {group.items.map((it) => {
                          const active = activeItem === it.id;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => setActiveItem(it.id)}
                              className={`relative mt-1 flex w-full items-center rounded-xl px-2 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/45 ${
                                active
                                  ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand-ink)]"
                                  : "text-[var(--muted-ink)] hover:bg-white/80 hover:text-[var(--brand)]"
                              }`}
                            >
                              {active && (
                                <span className="absolute -left-[9px] h-6 w-1.5 rounded-full bg-[var(--brand)] shadow-[0_0_12px_rgba(48,81,140,.5)]" />
                              )}
                              <span className="truncate">{it.label}</span>
                            </button>
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
      </div>
    </motion.aside>
  );
}

