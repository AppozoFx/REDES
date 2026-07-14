"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, Headset, MapPin, RefreshCw, ShieldCheck, Users, Radar, Warehouse, type LucideIcon } from "lucide-react";
import type { StatusBoardData } from "@/domain/presencia/statusBoard";
import { DeskCard } from "./DeskCard";

const ROOM_COLORS: Record<string, string> = {
  gestion: "#e46a86",
  coordinacion: "#5b9be0",
  supervision: "#9b7fe0",
  direccion: "#c99a42",
  soporte: "#5fa07f",
  ti: "#4fb0a8",
  campo: "#10b981",
};
const DEFAULT_ROOM_COLOR = "#5b9be0";

const ROOM_ICONS: Record<string, LucideIcon> = {
  gestion: Headset,
  coordinacion: Users,
  supervision: Radar,
  direccion: Briefcase,
  soporte: ShieldCheck,
  ti: Warehouse,
  campo: MapPin,
};

const POLL_MS = 10000;

export function StatusBoard({ initial }: { initial: StatusBoardData }) {
  const [board, setBoard] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [hiddenRoomIds, setHiddenRoomIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/home/status", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setBoard({ generatedAt: json.generatedAt, rooms: json.rooms, campo: json.campo });
      }
    } catch {
      // se mantiene el último estado conocido si falla el refresco
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function toggleRoom(id: string) {
    setHiddenRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filterChips = [
    ...board.rooms.map((r) => ({ id: r.id, title: r.title })),
    ...(board.campo.total > 0 ? [{ id: "campo", title: board.campo.title }] : []),
  ];

  const visibleRooms = board.rooms.filter((r) => !hiddenRoomIds.has(r.id));
  const showCampo = board.campo.total > 0 && !hiddenRoomIds.has("campo");
  const totalPeople = board.rooms.reduce((acc, r) => acc + r.people.length, 0) + board.campo.total;

  return (
    <div className="space-y-4">
      {filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => {
            const Icon = ROOM_ICONS[chip.id] ?? Users;
            const color = ROOM_COLORS[chip.id] || DEFAULT_ROOM_COLOR;
            const active = !hiddenRoomIds.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleRoom(chip.id)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-transparent text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:text-slate-300"
                }`}
                style={active ? { backgroundColor: color } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {chip.title}
              </button>
            );
          })}

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Actualizar ahora"
            title="Actualizar ahora"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {totalPeople === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
          Todavía no hay usuarios con presencia registrada.
        </p>
      ) : visibleRooms.length === 0 && !showCampo ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
          No hay salas seleccionadas. Activa alguna arriba para verla.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRooms.map((room) => {
            const Icon = ROOM_ICONS[room.id] ?? Users;
            const color = ROOM_COLORS[room.id] || DEFAULT_ROOM_COLOR;
            return (
              <section
                key={room.id}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-700/80 dark:bg-slate-900"
              >
                <div className="h-1" style={{ backgroundColor: color }} />
                <div className="p-3" style={{ backgroundImage: `linear-gradient(180deg, ${color}14, transparent 65%)` }}>
                  <header className="mb-3 flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.title}</h2>
                      <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">{room.roleLabel}</span>
                    </div>
                  </header>
                  <div className="flex flex-wrap gap-2.5">
                    {room.people.map((person) => (
                      <DeskCard key={person.uid} person={person} roleColor={color} />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}

          {showCampo && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-700/80 dark:bg-slate-900">
              <div className="h-1" style={{ backgroundColor: ROOM_COLORS.campo }} />
              <div
                className="p-3"
                style={{ backgroundImage: `linear-gradient(180deg, ${ROOM_COLORS.campo}14, transparent 65%)` }}
              >
                <header className="mb-3 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: ROOM_COLORS.campo }}
                  >
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{board.campo.title}</h2>
                    <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">{board.campo.roleLabel}</span>
                  </div>
                </header>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{board.campo.online}</span>
                  <span className="text-slate-400"> / {board.campo.total} en ruta</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">Los técnicos trabajan en campo, no en un escritorio.</p>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
