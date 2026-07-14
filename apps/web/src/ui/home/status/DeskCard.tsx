"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { StatusPerson } from "@/domain/presencia/statusBoard";

const SKINS = ["#e8b487", "#c98a58", "#8a5a35"];
const HAIRS = ["#2b2338", "#5c3a21", "#1c1c1c", "#7a4a2b"];
const OUTLINE = "#14121f";

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function Character({ roleColor, uid, genero }: { roleColor: string; uid: string; genero: string }) {
  const skin = SKINS[hashCode(uid) % SKINS.length];
  const hair = HAIRS[hashCode(`${uid}-hair`) % HAIRS.length];
  const longHair = genero === "F";

  return (
    <svg viewBox="0 0 24 32" shapeRendering="crispEdges" aria-hidden="true" className="h-[69px] w-[51px]">
      {longHair ? (
        <>
          <rect x="3" y="5" width="3" height="11" fill={hair} stroke={OUTLINE} strokeWidth="1" />
          <rect x="18" y="5" width="3" height="11" fill={hair} stroke={OUTLINE} strokeWidth="1" />
        </>
      ) : (
        <>
          <rect x="4" y="5" width="2" height="3" fill={hair} stroke={OUTLINE} strokeWidth="1" />
          <rect x="18" y="5" width="2" height="3" fill={hair} stroke={OUTLINE} strokeWidth="1" />
        </>
      )}
      <rect x="6" y={longHair ? 2 : 3} width="12" height={longHair ? 4 : 3} fill={hair} stroke={OUTLINE} strokeWidth="1" />
      <rect x="6" y="6" width="12" height="8" fill={skin} stroke={OUTLINE} strokeWidth="1" />
      <rect x="9" y="11" width="2" height="2" fill={OUTLINE} />
      <rect x="15" y="11" width="2" height="2" fill={OUTLINE} />
      <rect x="4" y="14" width="16" height="12" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
      <rect x="0" y="15" width="4" height="10" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
      <rect x="20" y="15" width="4" height="10" fill={roleColor} stroke={OUTLINE} strokeWidth="1" />
    </svg>
  );
}

const REFRIGERIO_PHASES = ["comiendo", "durmiendo", "celular"] as const;
type RefrigerioPhase = (typeof REFRIGERIO_PHASES)[number];
const PHASE_MS = 5000;

function usePhase(active: boolean, seed: string): RefrigerioPhase {
  const startIdx = hashCode(seed) % REFRIGERIO_PHASES.length;
  const [idx, setIdx] = useState(startIdx);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % REFRIGERIO_PHASES.length);
    }, PHASE_MS);
    return () => clearInterval(id);
  }, [active]);

  return REFRIGERIO_PHASES[active ? idx : startIdx];
}

function ComiendoOverlay({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute -right-[6px] -top-[6px] flex flex-col items-center" aria-hidden="true">
      <div className="mb-[2px] flex gap-[5px]">
        {[0, 0.35].map((delay) => (
          <motion.span
            key={delay}
            className="block h-[10px] w-[3px] rounded-full bg-amber-500/80 dark:bg-amber-300/80"
            animate={reduceMotion ? { opacity: 0.7 } : { y: [0, -6, 0], opacity: [0.85, 0.15, 0.85] }}
            transition={reduceMotion ? undefined : { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay }}
          />
        ))}
      </div>
      <div className="h-[9px] w-[16px] rounded-b-[3px] border border-amber-800/70 bg-amber-400 dark:border-amber-900 dark:bg-amber-500" />
      <motion.div
        className="absolute -bottom-[1px] left-1/2 h-[9px] w-[2px] -translate-x-1/2 rounded-full bg-slate-500 dark:bg-slate-300"
        style={{ transformOrigin: "50% 100%" }}
        animate={reduceMotion ? { rotate: -12 } : { rotate: [-18, 4, -18], y: [-1, 1, -1] }}
        transition={reduceMotion ? undefined : { duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function DurmiendoOverlay({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute -right-3 -top-3 flex flex-col items-end" aria-hidden="true">
      {[
        { size: "text-[15px]", delay: 0, x: 0 },
        { size: "text-[12px]", delay: 0.6, x: 5 },
      ].map((z) => (
        <motion.span
          key={z.delay}
          className={`${z.size} font-mono font-bold leading-none text-sky-500/90 dark:text-sky-300/90`}
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0.7 }
              : { y: [4, -10], x: [0, z.x], opacity: [0, 1, 0] }
          }
          transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, ease: "easeOut", delay: z.delay }}
        >
          Z
        </motion.span>
      ))}
    </div>
  );
}

function CelularOverlay({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute -bottom-[6px] -right-3"
      aria-hidden="true"
      animate={reduceMotion ? { rotate: -8 } : { rotate: [-10, -4, -10] }}
      transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 100%" }}
    >
      <div className="h-[15px] w-[9px] rounded-[2px] border border-slate-800 bg-slate-700 dark:border-slate-950 dark:bg-slate-600">
        <motion.div
          className="mx-[2px] mt-[2px] h-[9px] w-[5px] rounded-[1px] bg-sky-300"
          animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0.5, 1, 0.5] }}
          transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}

function LlamadaOverlay({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute -right-3 top-0" aria-hidden="true">
      {!reduceMotion && (
        <motion.span
          className="absolute -left-[5px] -top-[5px] block h-[21px] w-[21px] rounded-full border border-sky-400/80"
          animate={{ scale: [0.4, 1.7], opacity: [0.75, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.div
        className="h-[13px] w-[8px] rounded-[2px] border border-sky-800 bg-sky-500 dark:border-sky-950 dark:bg-sky-400"
        style={{ transformOrigin: "50% 100%" }}
        animate={reduceMotion ? { rotate: -22 } : { rotate: [-28, -16, -28] }}
        transition={reduceMotion ? undefined : { duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

const PHASE_OVERLAY: Record<RefrigerioPhase, typeof ComiendoOverlay> = {
  comiendo: ComiendoOverlay,
  durmiendo: DurmiendoOverlay,
  celular: CelularOverlay,
};

const PHASE_MOTION: Record<RefrigerioPhase, { animate: Record<string, number[]>; duration: number }> = {
  comiendo: { animate: { rotate: [-4, 4, -4] }, duration: 1.8 },
  durmiendo: { animate: { rotate: [0, 5, 0], y: [0, 1, 0] }, duration: 3.4 },
  celular: { animate: { rotate: [-3, 3, -3] }, duration: 1.6 },
};

const STATE_LABEL: Record<StatusPerson["state"], string> = {
  online: "Conectado",
  en_gestion: "En Gestión",
  refrigerio: "En refrigerio",
  llamada: "En llamada",
  finalizado: "Jornada finalizada",
  ausente_jornada: "Ausente",
  ausente_sin_ingreso: "Ausente",
  away: "Ausente",
};

const STATE_STYLES: Record<StatusPerson["state"], { screen: string; dot: string; badge: string; present: boolean }> = {
  online: {
    screen: "border-teal-600/60 bg-teal-50 dark:border-teal-400/40 dark:bg-teal-950/40",
    dot: "bg-teal-400",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
    present: true,
  },
  en_gestion: {
    screen: "border-teal-600/60 bg-teal-50 dark:border-teal-400/40 dark:bg-teal-950/40",
    dot: "bg-teal-400",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
    present: true,
  },
  refrigerio: {
    screen: "border-amber-500/60 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-950/40",
    dot: "bg-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    present: true,
  },
  llamada: {
    screen: "border-sky-600/60 bg-sky-50 dark:border-sky-400/40 dark:bg-sky-950/40",
    dot: "bg-sky-400",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    present: true,
  },
  finalizado: {
    screen: "border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-950/30",
    dot: "bg-violet-300",
    badge: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
    present: false,
  },
  ausente_jornada: {
    screen: "border-orange-400 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-950/30",
    dot: "bg-orange-400/70",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    present: false,
  },
  ausente_sin_ingreso: {
    screen: "border-red-400 bg-red-50 dark:border-red-500/40 dark:bg-red-950/30",
    dot: "bg-red-400/70",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    present: false,
  },
  away: {
    screen: "border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60",
    dot: "bg-slate-400/50",
    badge: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    present: false,
  },
};

export function DeskCard({ person, roleColor }: { person: StatusPerson; roleColor: string }) {
  const reduceMotion = !!useReducedMotion();
  const style = STATE_STYLES[person.state];
  const isRefrigerio = person.state === "refrigerio";
  const isLlamada = person.state === "llamada";
  const phase = usePhase(isRefrigerio, person.uid);
  const Overlay = PHASE_OVERLAY[phase];

  const animateTarget =
    reduceMotion || !style.present
      ? { y: 0, rotate: 0 }
      : isRefrigerio
        ? PHASE_MOTION[phase].animate
        : isLlamada
          ? { rotate: [-3, 3, -3] }
          : { y: [0, -2, 0] };
  const transition =
    reduceMotion || !style.present
      ? undefined
      : {
          duration: isRefrigerio ? PHASE_MOTION[phase].duration : isLlamada ? 0.8 : 2.6,
          repeat: Infinity,
          ease: "easeInOut" as const,
        };

  return (
    <div
      className="relative flex w-[85px] flex-col items-center"
      title={`${person.nombre} · ${STATE_LABEL[person.state]}`}
    >
      {/* Espacio reservado del personaje: mantiene alineado el escritorio aunque esté ausente */}
      <div className="relative flex h-[69px] w-[51px] items-end justify-center">
        <AnimatePresence>
          {style.present && (
            <motion.div
              key="character"
              animate={animateTarget}
              transition={transition}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      x: [0, 10, 22, 36],
                      y: [0, -2, 0, -1],
                      opacity: [1, 1, 0.6, 0],
                      transition: { duration: 0.6, ease: "easeIn" },
                    }
              }
              style={{ transformOrigin: "50% 100%" }}
            >
              <Character roleColor={roleColor} uid={person.uid} genero={person.genero} />
              {isRefrigerio && <Overlay reduceMotion={reduceMotion} />}
              {isLlamada && <LlamadaOverlay reduceMotion={reduceMotion} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`-mt-[3px] flex h-[25px] w-[69px] items-start justify-center rounded-t-sm border-2 pt-[3px] ${style.screen}`}>
        <div className={`h-[6px] w-[19px] rounded-sm ${style.dot}`} />
      </div>

      <div className="mt-1 flex max-w-full flex-col items-center gap-0.5 text-center">
        <span className="max-w-[80px] truncate text-[9px] font-medium text-slate-700 dark:text-slate-200">
          {person.nombre}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${style.badge}`}>
          {STATE_LABEL[person.state]}
        </span>
      </div>
    </div>
  );
}
