"use client";

import { useEffect, useRef, useState } from "react";
import type { StatusBoardData } from "@/domain/presencia/statusBoard";
import { DeskCard } from "./DeskCard";

const ROOM_COLORS: Record<string, string> = {
  gestion: "#e46a86",
  coordinacion: "#5b9be0",
  supervision: "#9b7fe0",
  direccion: "#c99a42",
  soporte: "#5fa07f",
  ti: "#4fb0a8",
};
const DEFAULT_ROOM_COLOR = "#5b9be0";

const POLL_MS = 10000;

function timeAgo(iso: string): string {
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 5) return "recién";
  if (diffSec < 60) return `hace ${diffSec}s`;
  const min = Math.round(diffSec / 60);
  return `hace ${min} min`;
}

export function StatusBoard({ initial }: { initial: StatusBoardData }) {
  const [board, setBoard] = useState(initial);
  const [loading, setLoading] = useState(false);
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

  const allPeople = board.rooms.flatMap((r) => r.people);
  const totalRefrigerio = allPeople.filter((p) => p.state === "refrigerio").length;
  const totalLlamada = allPeople.filter((p) => p.state === "llamada").length;
  const totalPresent =
    allPeople.filter(
      (p) => p.state === "online" || p.state === "en_gestion" || p.state === "refrigerio" || p.state === "llamada"
    ).length + board.campo.online;
  const totalPeople = allPeople.length + board.campo.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-400">
        <span>
          <span className="font-semibold text-teal-600 dark:text-teal-400">{totalPresent}</span> de {totalPeople}{" "}
          conectados
          {(totalRefrigerio > 0 || totalLlamada > 0) && (
            <>
              {" "}
              (
              {totalRefrigerio > 0 && (
                <>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{totalRefrigerio}</span> en refrigerio
                </>
              )}
              {totalRefrigerio > 0 && totalLlamada > 0 && ", "}
              {totalLlamada > 0 && (
                <>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">{totalLlamada}</span> en llamada
                </>
              )}
              )
            </>
          )}{" "}
          · actualizado {timeAgo(board.generatedAt)}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {loading ? "Actualizando…" : "Actualizar ahora"}
        </button>
      </div>

      {totalPeople === 0 && board.campo.total === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
          Todavía no hay usuarios con presencia registrada.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.rooms.map((room) => (
            <section
              key={room.id}
              className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3 dark:border-slate-700/80 dark:from-slate-900 dark:to-slate-950"
            >
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.title}</h2>
                <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{room.roleLabel}</span>
              </header>
              <div className="flex flex-wrap gap-2.5">
                {room.people.map((person) => (
                  <DeskCard key={person.uid} person={person} roleColor={ROOM_COLORS[room.id] || DEFAULT_ROOM_COLOR} />
                ))}
              </div>
            </section>
          ))}

          {board.campo.total > 0 && (
            <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-emerald-50/60 to-white p-3 dark:border-slate-700/80 dark:from-emerald-950/20 dark:to-slate-950">
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{board.campo.title}</h2>
                <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{board.campo.roleLabel}</span>
              </header>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="text-lg font-semibold text-teal-600 dark:text-teal-400">{board.campo.online}</span>
                <span className="text-slate-400"> / {board.campo.total} en ruta</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">Los técnicos trabajan en campo, no en un escritorio.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
