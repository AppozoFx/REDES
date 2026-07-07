import fs from "fs";
import path from "path";
import type { WinboSession } from "./client";

// Flujo "cerrar cuadrilla" de WinBo (Paginas/Cuadrillas/Grilla.aspx).
// Todas las respuestas llegan como { d: "<base64 de JSON>" } y algunos campos
// internos (html, resul, registros, cantidad) vienen a su vez en base64.

export const WINBO_MOTIVO_RETIRO_DE_CAMPO = "6"; // "RETIRO DE CAMPO"

const GRILLA_PATH = "/Paginas/Cuadrillas/Grilla.aspx";
const GRILLA_ID_PAGE = 12;

export type CuadrillaWinbo = {
  cuadriId: string;
  nombreWinbo: string;
};

export type HorarioWinbo = {
  valido: boolean;
  raw: string;
};

export type NotificacionAprobacion = {
  notiId: string;
  solicitudNum: string;
  cuadrillaNombre: string;
  fechaTexto: string; // "dd/mm/yyyy HH:mm" hora Lima, tal como lo entrega WinBo
};

function decodeBase64Utf8(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function decodeD(payload: any): any {
  const raw = String(payload?.d ?? "").trim();
  if (!raw) throw new Error("WINBO_EMPTY_RESPONSE");
  let decoded: string;
  try {
    decoded = decodeBase64Utf8(raw);
  } catch {
    throw new Error("WINBO_BAD_RESPONSE");
  }
  try {
    return JSON.parse(decoded);
  } catch {
    return { raw: decoded };
  }
}

// El campo `resul` de cargarMisNoti es código JS cuyos strings traen escapes \uXXXX
function unescapeJsUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function parseCuadrillaRedesId(cuadrillaId: string): { numero: number; tipo: "MOTO" | "RESIDENCIAL" } {
  const m = String(cuadrillaId || "")
    .trim()
    .toUpperCase()
    .match(/^K(\d+)_(MOTO|RESIDENCIAL)$/);
  if (!m) throw new Error("CUADRILLA_ID_INVALIDO");
  return { numero: Number(m[1]), tipo: m[2] as "MOTO" | "RESIDENCIAL" };
}

// En WinBo el prefijo del nombre es estable ("K {n} [MOTOWIN ]M&D SGI"); el
// nombre del técnico que va después varía y no participa en la identificación.
// La búsqueda en cargarGrilla se hace amplia ("K {n}") porque el backend de
// WinBo no matchea de forma fiable términos con "&"; el filtrado exacto lo
// hace winboNameRegex sobre las filas devueltas.
export function winboSearchName(cuadrillaId: string): string {
  const { numero } = parseCuadrillaRedesId(cuadrillaId);
  return `K ${numero}`;
}

function winboNameRegex(cuadrillaId: string): RegExp {
  const { numero, tipo } = parseCuadrillaRedesId(cuadrillaId);
  // Anclada al inicio y con "M&D SGI" inmediatamente después del número para
  // que "K 1" no matchee "K 15"/"K 11" ni la residencial matchee la MOTOWIN.
  return tipo === "MOTO"
    ? new RegExp(`^K\\s*${numero}\\s+MOTOWIN\\s+M&D\\s+SGI(\\s|$)`, "i")
    : new RegExp(`^K\\s*${numero}\\s+M&D\\s+SGI(\\s|$)`, "i");
}

function parseGrillaRows(html: string): CuadrillaWinbo[] {
  const rows: CuadrillaWinbo[] = [];
  for (const chunk of html.split(/<tr\b/i).slice(1)) {
    const nombre = chunk.match(/class='tx-inverse'>([^<]+)</i)?.[1]?.trim();
    const cuadriId = chunk.match(/data-cuadriid='(\d+)'/i)?.[1];
    if (nombre && cuadriId) rows.push({ cuadriId, nombreWinbo: nombre });
  }
  return rows;
}

export async function buscarCuadrillaWinbo(session: WinboSession, cuadrillaId: string): Promise<CuadrillaWinbo> {
  const nombreBusqueda = winboSearchName(cuadrillaId);
  const respuesta = await session.post(`${GRILLA_PATH}/cargarGrilla`, {
    Nombre: nombreBusqueda,
    tipoCuadri: 1,
    sectorOpeId: null,
    tipoProducId: null,
    dia: "0",
    CodigoPersonalizado: "",
    CodiEsta: "1",
    Empresa: null,
    Pais: null,
    pagiActu: 1,
    idPage: GRILLA_ID_PAGE,
    enRefrigerio: "0",
    CodiTiposCosto: "",
  });
  const data = decodeD(respuesta);
  if (data?.err && data.err !== "N") throw new Error("WINBO_GRILLA_ERROR");

  const html = decodeBase64Utf8(String(data?.html ?? ""));
  const nameRe = winboNameRegex(cuadrillaId);
  const rows = parseGrillaRows(html);
  const matches = rows.filter((row) => nameRe.test(row.nombreWinbo));

  if (matches.length === 0) {
    const err = new Error("CUADRILLA_NO_ENCONTRADA_WINBO") as Error & { candidatos?: string[]; registros?: string };
    err.candidatos = rows.map((r) => r.nombreWinbo);
    err.registros = String(data?.registros ? decodeBase64Utf8(String(data.registros)) : "0");
    throw err;
  }
  const ids = new Set(matches.map((m) => m.cuadriId));
  if (ids.size > 1) {
    const err = new Error("CUADRILLA_AMBIGUA_WINBO") as Error & { candidatos?: string[] };
    err.candidatos = matches.map((m) => `${m.nombreWinbo} (${m.cuadriId})`);
    throw err;
  }
  return matches[0];
}

export async function esHorarioValido(session: WinboSession): Promise<HorarioWinbo> {
  const respuesta = await session.post(`${GRILLA_PATH}/EsHorarioValido`, {});
  const d = respuesta?.d;
  if (typeof d === "boolean") return { valido: d, raw: String(d) };

  let texto = String(d ?? "").trim();
  try {
    texto = decodeBase64Utf8(texto).trim();
  } catch {
    // la respuesta puede venir sin base64
  }
  const normalizado = texto.toLowerCase();
  // Formato exacto no capturado en el HAR: se acepta true / "S" / err:"N".
  const valido =
    normalizado === "true" ||
    normalizado === "s" ||
    normalizado.includes('"err":"n"') ||
    normalizado.includes('"err": "n"') ||
    normalizado.includes("true");
  return { valido, raw: texto };
}

let evidenciaCache: string | null = null;

// Evidencia estándar del cierre: public/img/win.jpeg en base64 crudo (sin prefijo data:)
export function evidenciaCierreBase64(): string {
  if (!evidenciaCache) {
    const ruta = path.join(process.cwd(), "public", "img", "win.jpeg");
    evidenciaCache = fs.readFileSync(ruta).toString("base64");
  }
  return evidenciaCache;
}

export type CerrarCuadrillaInput = {
  cuadriId: string;
  dia: number; // convención WinBo: 1=lunes … 6=sábado, 7=domingo
  motivoId?: string;
  observacion?: string;
};

export async function cerrarCuadrillaWinbo(
  session: WinboSession,
  input: CerrarCuadrillaInput
): Promise<{ nuevoEstado: string }> {
  const respuesta = await session.post(`${GRILLA_PATH}/ActualizarDiaConfig`, {
    CuadriId: String(input.cuadriId),
    Dia: input.dia,
    Estado: "N",
    MotiDesacId: input.motivoId ?? WINBO_MOTIVO_RETIRO_DE_CAMPO,
    Evidencia: evidenciaCierreBase64(),
    Observacion: input.observacion ?? "",
  });
  const data = decodeD(respuesta);
  if (data?.err !== "N") throw new Error("WINBO_CIERRE_FALLIDO");
  return { nuevoEstado: String(data?.nuevoEstado ?? "") };
}

// Lee cargarMisNoti y devuelve solo las notificaciones de aprobación de cambio
// de proveedor ("Se aprobó la solicitud de cambio desde el proveedor, Solicitud N°X cuadrilla: Y").
export async function listarAprobacionesCierre(session: WinboSession): Promise<NotificacionAprobacion[]> {
  const respuesta = await session.post("/default.aspx/cargarMisNoti", { IdPage: "", Top: "" });
  const data = decodeD(respuesta);
  if (data?.err && data.err !== "N") throw new Error("WINBO_NOTI_ERROR");

  const resul = unescapeJsUnicode(decodeBase64Utf8(String(data?.resul ?? "")));
  const notis: NotificacionAprobacion[] = [];
  const anchorRe = /id='aNoti(\d+)'[\s\S]*?class='noti-text'>([\s\S]*?)<\/p>[\s\S]*?<span>([^<]+)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(resul))) {
    const [, notiId, textoHtml, fechaTexto] = m;
    const texto = textoHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const aprob = texto.match(
      /Se aprobó la solicitud de cambio desde el proveedor[,.]?\s*Solicitud N[°º]?\s*(\d+)\s+cuadrilla:\s*(.+)$/i
    );
    if (!aprob) continue;
    notis.push({
      notiId,
      solicitudNum: aprob[1],
      cuadrillaNombre: aprob[2].trim(),
      fechaTexto: fechaTexto.trim(),
    });
  }
  return notis;
}

export function buscarAprobacionDeCuadrilla(
  notis: NotificacionAprobacion[],
  nombreWinbo: string
): NotificacionAprobacion | null {
  const objetivo = nombreWinbo.replace(/\s+/g, " ").trim().toUpperCase();
  return notis.find((n) => n.cuadrillaNombre.replace(/\s+/g, " ").trim().toUpperCase() === objetivo) ?? null;
}

const DIA_WINBO_POR_WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function diaWinboHoyLima(): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short" }).format(new Date());
  const dia = DIA_WINBO_POR_WEEKDAY[weekday];
  if (!dia) throw new Error("DIA_WINBO_INVALIDO");
  return dia;
}

export function ymdLima(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
