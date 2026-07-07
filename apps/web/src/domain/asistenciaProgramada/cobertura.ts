// Fuente de verdad backend para reglas de cobertura y cuota equitativa de
// descanso de "Asistencia Programada". Consumida por:
// - app/api/instalaciones/asistencia-programada/route.ts
// - app/api/instalaciones/asistencia-programada/solicitudes/route.ts
// - app/api/instalaciones/asistencia-programada/solicitudes/[id]/responder/route.ts
//
// El cliente (AsistenciaProgramadaClient.tsx) mantiene su propia copia para
// feedback instantáneo en el navegador; si cambias las reglas aquí, replica
// el cambio ahí también.

export type Cuadrilla = {
  id: string;
  categoria?: string;
  vehiculo?: string;
  nombre?: string;
  coordinadorUid?: string;
};

export type ItemsMap = Record<string, Record<string, string>>;

export type CoberturaEstado = "ok" | "warn" | "bad" | "none";

// DOW: 0=Dom 1=Lun … 6=Sáb
export const COBERTURA_REGLAS: Record<
  number,
  { minPct: number; byCategoria?: { RESIDENCIAL: number; MOTO: number } }
> = {
  0: { minPct: 0, byCategoria: { RESIDENCIAL: 60, MOTO: 40 } },
  1: { minPct: 70 },
  2: { minPct: 85 },
  3: { minPct: 85 },
  4: { minPct: 85 },
  5: { minPct: 85 },
  6: { minPct: 97 },
};

export const DAY_NAMES: Record<number, string> = {
  0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles",
  4: "Jueves", 5: "Viernes", 6: "Sábado",
};

// Cuadrillas extra que un coordinador puede acumular sobre su cuota justa
// antes de bloquear el guardado (absorbe redondeo en equipos pequeños).
export const TOLERANCIA_CUPO = 1;

export function categoriaCuadrilla(c: { categoria?: string; vehiculo?: string; nombre?: string }): "RESIDENCIAL" | "MOTO" | "OTRO" {
  const cat = String(c.categoria || "").toUpperCase();
  const veh = String(c.vehiculo || "").toUpperCase();
  const nom = String(c.nombre || "").toUpperCase();
  if (cat === "RESIDENCIAL" || nom.includes("RESIDENCIAL")) return "RESIDENCIAL";
  if (cat === "CONDOMINIO" || veh === "MOTO" || nom.includes("MOTO")) return "MOTO";
  return "OTRO";
}

function dowOf(ymd: string) {
  return new Date(`${ymd}T00:00:00`).getDay();
}

/** Fecha de hoy (YYYY-MM-DD) en zona horaria America/Lima, usada para bloquear la edición de días pasados. */
export function limaTodayYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

function isAsistencia(items: ItemsMap, cid: string, ymd: string) {
  return String(items?.[cid]?.[ymd] || "asistencia").toLowerCase() === "asistencia";
}

/**
 * Evalúa si el día cumple el % mínimo de cobertura (global, o Residencial/Moto
 * por separado el domingo). Unifica `coberturaDelDiaBE` / `checkCoverage`
 * que antes vivían duplicadas en los tres route.ts.
 */
export function coberturaDelDia(
  ymd: string,
  cuadrillas: Cuadrilla[],
  items: ItemsMap,
): { estado: CoberturaEstado; errorMsg?: string } {
  if (cuadrillas.length === 0) return { estado: "none" };
  const dow = dowOf(ymd);
  const regla = COBERTURA_REGLAS[dow];
  if (!regla) return { estado: "none" };
  const dayName = DAY_NAMES[dow] || ymd;

  if (regla.byCategoria && dow === 0) {
    const residencial = cuadrillas.filter((c) => categoriaCuadrilla(c) === "RESIDENCIAL");
    const moto = cuadrillas.filter((c) => categoriaCuadrilla(c) === "MOTO");
    const resMin = regla.byCategoria.RESIDENCIAL;
    const motoMin = regla.byCategoria.MOTO;

    if (residencial.length > 0) {
      const resPct = Math.round(
        (residencial.filter((c) => isAsistencia(items, c.id, ymd)).length / residencial.length) * 100,
      );
      if (resPct < resMin) {
        return {
          estado: "bad",
          errorMsg: `${dayName}: Residencial con ${resPct}% de asistencia (mínimo ${resMin}%). Ajusta los descansos antes de guardar.`,
        };
      }
    }
    if (moto.length > 0) {
      const motoPct = Math.round(
        (moto.filter((c) => isAsistencia(items, c.id, ymd)).length / moto.length) * 100,
      );
      if (motoPct < motoMin) {
        return {
          estado: "bad",
          errorMsg: `${dayName}: Moto con ${motoPct}% de asistencia (mínimo ${motoMin}%). Ajusta los descansos antes de guardar.`,
        };
      }
    }
    return { estado: "ok" };
  }

  const count = cuadrillas.filter((c) => isAsistencia(items, c.id, ymd)).length;
  const pct = Math.round((count / cuadrillas.length) * 100);
  if (pct < regla.minPct) {
    return {
      estado: "bad",
      errorMsg: `${dayName} (${ymd}): ${pct}% de asistencia (mínimo requerido ${regla.minPct}%). Ajusta los descansos antes de guardar.`,
    };
  }
  return { estado: "ok" };
}

/**
 * Simula aplicar `nuevoEstado` a `cuadrillaId` en `dia` y evalúa cobertura
 * sobre el resultado. Usado por las solicitudes de cambio (donde solo se
 * conoce un cambio puntual, no la grilla completa ya guardada).
 */
export function coberturaTrasCambio(
  dia: string,
  cuadrillaId: string,
  nuevoEstado: string,
  cuadrillas: Cuadrilla[],
  items: ItemsMap,
): { ok: boolean; reason?: string } {
  const simItems: ItemsMap = { ...items, [cuadrillaId]: { ...(items[cuadrillaId] || {}), [dia]: nuevoEstado } };
  const resultado = coberturaDelDia(dia, cuadrillas, simItems);
  if (resultado.estado === "bad") return { ok: false, reason: resultado.errorMsg };
  return { ok: true };
}

/**
 * Cupo justo de descanso de un coordinador para un día dado: proporcional a
 * cuántas cuadrillas tiene dentro del pool relevante (Residencial/Moto el
 * domingo, todas las demás el resto de la semana), con una tolerancia fija
 * para absorber redondeo. Solo aplica a COORDINADOR — Gerencia/Jefatura/Admin
 * no tienen tope.
 */
export function cupoYCuotaCoordinador(
  ymd: string,
  coordinadorUid: string,
  cuadrillas: Cuadrilla[],
  items: ItemsMap,
): { ok: boolean; misDescansos: number; maxPermitido: number; errorMsg?: string } {
  const dow = dowOf(ymd);
  const regla = COBERTURA_REGLAS[dow];
  if (!regla) return { ok: true, misDescansos: 0, maxPermitido: Infinity };

  // Si el día global ya está "bad", ese es el error real — no se evalúa cuota.
  const global = coberturaDelDia(ymd, cuadrillas, items);
  if (global.estado === "bad") return { ok: true, misDescansos: 0, maxPermitido: Infinity };

  const dayName = DAY_NAMES[dow] || ymd;
  const descansando = (c: Cuadrilla) => !isAsistencia(items, c.id, ymd);

  const evaluarPool = (pool: Cuadrilla[], minPct: number) => {
    const total = pool.length;
    if (total === 0) return { ok: true, misDescansos: 0, maxPermitido: Infinity };
    const cupoGlobalDescanso = total - Math.ceil((total * minPct) / 100);
    const mios = pool.filter((c) => c.coordinadorUid === coordinadorUid);
    if (mios.length === 0) return { ok: true, misDescansos: 0, maxPermitido: Infinity };
    const cuotaJusta = cupoGlobalDescanso * (mios.length / total);
    const maxPermitido = Math.ceil(cuotaJusta) + TOLERANCIA_CUPO;
    const misDescansos = mios.filter(descansando).length;
    if (misDescansos > maxPermitido) {
      return {
        ok: false,
        misDescansos,
        maxPermitido,
        errorMsg: `${dayName}: tienes ${misDescansos} cuadrilla(s) en descanso (cuota equitativa: ${maxPermitido}, según tu proporción de cuadrillas). Ajusta antes de guardar.`,
      };
    }
    return { ok: true, misDescansos, maxPermitido };
  };

  if (regla.byCategoria && dow === 0) {
    const residencial = cuadrillas.filter((c) => categoriaCuadrilla(c) === "RESIDENCIAL");
    const moto = cuadrillas.filter((c) => categoriaCuadrilla(c) === "MOTO");
    const resResult = evaluarPool(residencial, regla.byCategoria.RESIDENCIAL);
    if (!resResult.ok) return resResult;
    const motoResult = evaluarPool(moto, regla.byCategoria.MOTO);
    if (!motoResult.ok) return motoResult;
    return {
      ok: true,
      misDescansos: resResult.misDescansos + motoResult.misDescansos,
      maxPermitido: resResult.maxPermitido + motoResult.maxPermitido,
    };
  }

  return evaluarPool(cuadrillas, regla.minPct);
}
