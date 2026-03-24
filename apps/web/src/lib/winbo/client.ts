type WinboRequestFilters = {
  pagActu?: number;
  zona?: string;
  region?: string;
  estado?: string;
  tipoOrden?: string;
  tipoTrabajo?: string;
  cuadrilla?: string;
  codigoCliente?: string;
  documento?: string;
};

export type WinboManualRequest = {
  fechaVisiDesde: string;
  fechaVisiHasta: string;
  nombreArchivo?: string;
  filtros?: WinboRequestFilters;
};

export type WinboDownloadResult = {
  nombreArchivo: string;
  downloadUrl: string;
  fileBuffer: Buffer;
};

type JsonPrimitive = string | number | boolean | null;

class CookieJar {
  private store = new Map<string, string>();

  addFromHeaders(headers: Headers) {
    const setCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    for (const raw of setCookie) {
      const pair = String(raw || "").split(";")[0] || "";
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!key) continue;
      this.store.set(key, value);
    }
  }

  toHeader() {
    return Array.from(this.store.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

function getBaseUrl() {
  return getRequiredEnv("WINBO_BASE_URL").replace(/\/$/, "");
}

function getExportBaseUrl() {
  return getRequiredEnv("WINBO_EXPORT_BASE_URL").replace(/\/$/, "");
}

function getTimeoutMs() {
  const n = Number(process.env.WINBO_TIMEOUT_MS || "15000");
  return Number.isFinite(n) && n > 0 ? n : 15000;
}

function getPollMs() {
  const n = Number(process.env.WINBO_EXPORT_POLL_MS || "2500");
  return Number.isFinite(n) && n > 0 ? n : 2500;
}

function getMaxRetries() {
  const n = Number(process.env.WINBO_EXPORT_MAX_RETRIES || "3");
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function ymdToDmy(ymd: string) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildDefaultExportFileName(fechaVisiDesde: string) {
  const m = String(fechaVisiDesde || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const day = m ? String(Number(m[3])).padStart(2, "0") : String(now.getDate()).padStart(2, "0");
  const month = m ? String(Number(m[2])).padStart(2, "0") : String(now.getMonth() + 1).padStart(2, "0");
  const year = m ? m[1] : String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `misOrdenesdeTrabajo${day}-${month}-${year}(${hh}-${mm}-${ss})`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("WINBO_REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  jar: CookieJar,
  path: string,
  body: Record<string, JsonPrimitive>,
  timeoutMs: number
) {
  const baseUrl = getBaseUrl();
  const cookieHeader = jar.toHeader();
  const response = await fetchWithTimeout(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  jar.addFromHeaders(response.headers);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WINBO_HTTP_${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function extractFileName(payload: any): string | null {
  const candidates = [
    payload?.d,
    payload?.fileName,
    payload?.nombreArchivo,
    payload?.archivo,
    payload?.file,
    payload?.url,
    payload?.downloadUrl,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;
    const fileMatch = raw.match(/([A-Za-z0-9._-]+\.xlsx)\b/i);
    if (fileMatch?.[1]) return fileMatch[1];
  }
  return null;
}

function buildExportPayload(input: WinboManualRequest): Record<string, JsonPrimitive> {
  const filtros = input.filtros || {};
  const fechaVisiDesde = ymdToDmy(input.fechaVisiDesde);
  const fechaVisiHasta = ymdToDmy(input.fechaVisiHasta);
  const nombreArchivo = String(input.nombreArchivo || "").trim() || buildDefaultExportFileName(input.fechaVisiDesde);
  const filtroString = `Visita Desde: ${fechaVisiDesde}|Visita Hasta: ${fechaVisiHasta}`;
  return {
    tipoTraba: filtros.tipoTrabajo || "0",
    estado: filtros.estado || "0",
    OrdenId: filtros.codigoCliente || "",
    NumeDocu: filtros.documento || "",
    Nombre: "",
    suscrip: "",
    fechaEstaDesde: "",
    fechaEstaHasta: "",
    fechaSoliDesde: "",
    fechaSoliHasta: "",
    fechaVisiDesde,
    fechaVisiHasta,
    filtroString,
    nombreArchivo,
    titulo: "Consulta ordenes de Trabajo",
    zona: filtros.zona || "0",
    region: filtros.region || "0",
    provincia: "0",
    localidad: "0",
    Pais: "0",
    Empresa: "0",
    conexion: "0",
    cuadrilla: filtros.cuadrilla || "0",
    tipoProduc: "0",
    producto: null,
    tipoUbi: "",
    ubi: "",
    tipoOrden: filtros.tipoOrden || "0",
    IdPage: "74",
    IdProyec: "",
    Motivo: "0",
    MotivosReproId: "0",
  };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadExportedFile(jar: CookieJar, fileName: string, timeoutMs: number) {
  const downloadUrl = `${getExportBaseUrl()}/${encodeURIComponent(fileName)}`;
  let lastError = "";
  for (let attempt = 1; attempt <= getMaxRetries(); attempt += 1) {
    const response = await fetchWithTimeout(
      downloadUrl,
      {
        method: "GET",
        headers: {
          Accept:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*",
          ...(jar.toHeader() ? { Cookie: jar.toHeader() } : {}),
        },
      },
      timeoutMs
    );

    if (response.ok) {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > 0) {
        return { nombreArchivo: fileName, downloadUrl, fileBuffer: buf };
      }
      lastError = "WINBO_EMPTY_FILE";
    } else {
      lastError = `WINBO_DOWNLOAD_HTTP_${response.status}`;
    }

    if (attempt < getMaxRetries()) {
      await wait(getPollMs() * attempt);
    }
  }

  throw new Error(lastError || "WINBO_DOWNLOAD_TIMEOUT");
}

export async function exportOrdenesXlsx(input: WinboManualRequest): Promise<WinboDownloadResult> {
  const username = getRequiredEnv("WINBO_USERNAME");
  const password = getRequiredEnv("WINBO_PASSWORD");
  const timeoutMs = getTimeoutMs();
  const jar = new CookieJar();

  try {
    await postJson(
      jar,
      "/login.aspx/IniciarSesion",
      {
        CodiUsua: username,
        "Contraseña": password,
        CodiSuscrip: "WIN",
        AutenDoblePasoCodi: "",
        LoginInterno: "N",
        Navegador: "Navegador Chrome version:145.0 sobre Windows",
        Query: "",
      },
      timeoutMs
    );
  } catch {
    throw new Error("WINBO_LOGIN_FAILED");
  }

  try {
    await postJson(jar, "/login.aspx/VerificarTermiCondi", {}, timeoutMs);
  } catch {
    throw new Error("WINBO_TERMS_FAILED");
  }

  let exportPayload: any;
  const requestedName = String(input.nombreArchivo || "").trim() || buildDefaultExportFileName(input.fechaVisiDesde);
  try {
    exportPayload = await postJson(
      jar,
      "/Paginas/OperadoresBO/misOrdenes.aspx/ExportarTabla",
      buildExportPayload({ ...input, nombreArchivo: requestedName }),
      timeoutMs
    );
  } catch {
    throw new Error("WINBO_EXPORT_FAILED");
  }

  const fileName = extractFileName(exportPayload) || requestedName;
  if (!fileName) {
    throw new Error("WINBO_EXPORT_FILENAME_NOT_FOUND");
  }

  try {
    const normalizedFileName = /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`;
    return await downloadExportedFile(jar, normalizedFileName, Math.max(timeoutMs, 30000));
  } catch (error: any) {
    if (String(error?.message || "").includes("TIMEOUT")) {
      throw new Error("WINBO_DOWNLOAD_TIMEOUT");
    }
    throw error;
  }
}
