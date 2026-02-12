export type InconcertMappedRow = {
  inicioLlamadaInconcert: string | null;
  usuaruioInconcert: string | null;
  telefonoCliente: string | null;
  cortaLlamadaInconcert: string | null;
  entraLlamadaInconcert: string | null;
  finLlamadaInconcert: string | null;
  duracion: string | null;
  espera: string | null;
  timbrado: string | null;
  atencion: string | null;
  observacionInconcert: string | null;
  bo: string | null;
  transferencia: string | null;
  _idConversacion: string | null;
};

function normHeader(v: string) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clean(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.toUpperCase() === "N/A") return null;
  return v;
}

export function normalizePhone(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-9) || null;
}

const ALIASES: Record<keyof InconcertMappedRow, string[]> = {
  inicioLlamadaInconcert: ["Fecha de inicio"],
  usuaruioInconcert: ["Agente"],
  telefonoCliente: ["Dir."],
  cortaLlamadaInconcert: ["Finalizador"],
  entraLlamadaInconcert: ["Fecha inicio atencion", "Fecha Inicio Aten.", "Fecha Inicio Aten"],
  finLlamadaInconcert: ["Fecha final"],
  duracion: ["Tiempo Dur.", "Tpo. Dur.", "Tpo Dur", "Tiempo Dur"],
  espera: ["Tiempo Esp.", "Tpo. Esp.", "Tpo Esp", "Tiempo Esp"],
  timbrado: ["Tiempo Timb.", "Tpo. Timb.", "Tpo Timb", "Tiempo Timb"],
  atencion: ["Tiempo atencion", "Tpo. Aten.", "Tpo Aten", "Tiempo Aten."],
  observacionInconcert: ["Disp."],
  bo: ["Tr."],
  transferencia: ["Tiempo Tr.", "Tpo. Tr.", "Tpo Tr", "Tiempo Tr"],
  _idConversacion: ["Id conversacion", "Id Conversacion", "Id Conversación", "Id conversación"],
};

function resolveByAliases(rawRow: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(rawRow || {})) {
    map.set(normHeader(k), v);
  }
  for (const alias of aliases) {
    const hit = map.get(normHeader(alias));
    if (hit !== undefined) return clean(hit);
  }
  return null;
}

export function mapCsvRow(rawRow: Record<string, unknown>): InconcertMappedRow {
  return {
    inicioLlamadaInconcert: resolveByAliases(rawRow, ALIASES.inicioLlamadaInconcert),
    usuaruioInconcert: resolveByAliases(rawRow, ALIASES.usuaruioInconcert),
    telefonoCliente: resolveByAliases(rawRow, ALIASES.telefonoCliente),
    cortaLlamadaInconcert: resolveByAliases(rawRow, ALIASES.cortaLlamadaInconcert),
    entraLlamadaInconcert: resolveByAliases(rawRow, ALIASES.entraLlamadaInconcert),
    finLlamadaInconcert: resolveByAliases(rawRow, ALIASES.finLlamadaInconcert),
    duracion: resolveByAliases(rawRow, ALIASES.duracion),
    espera: resolveByAliases(rawRow, ALIASES.espera),
    timbrado: resolveByAliases(rawRow, ALIASES.timbrado),
    atencion: resolveByAliases(rawRow, ALIASES.atencion),
    observacionInconcert: resolveByAliases(rawRow, ALIASES.observacionInconcert),
    bo: resolveByAliases(rawRow, ALIASES.bo),
    transferencia: resolveByAliases(rawRow, ALIASES.transferencia),
    _idConversacion: resolveByAliases(rawRow, ALIASES._idConversacion),
  };
}

export function hasMinimumData(rawRow: Record<string, unknown>) {
  const dir = resolveByAliases(rawRow, ALIASES.telefonoCliente);
  const ini = resolveByAliases(rawRow, ALIASES.inicioLlamadaInconcert);
  return !!dir || !!ini;
}

export const INCONCERT_PREVIEW_COLUMNS: Array<{ key: keyof InconcertMappedRow; label: string }> = [
  { key: "inicioLlamadaInconcert", label: "Inicio Llamada" },
  { key: "usuaruioInconcert", label: "Usuario" },
  { key: "telefonoCliente", label: "Telefono Cliente" },
  { key: "cortaLlamadaInconcert", label: "Corta Llamada" },
  { key: "entraLlamadaInconcert", label: "Entra Llamada" },
  { key: "finLlamadaInconcert", label: "Fin Llamada" },
  { key: "duracion", label: "Duracion" },
  { key: "espera", label: "Espera" },
  { key: "timbrado", label: "Timbrado" },
  { key: "atencion", label: "Atencion" },
  { key: "observacionInconcert", label: "Observacion" },
  { key: "bo", label: "BO" },
  { key: "transferencia", label: "Transferencia" },
  { key: "_idConversacion", label: "Id Conversacion" },
];

