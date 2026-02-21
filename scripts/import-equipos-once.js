/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const admin = require("firebase-admin");

function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function getArg(name, fallback = null) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx === -1) return fallback;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) return "true";
  return val;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getServiceAccount() {
  const raw =
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("SERVICE_ACCOUNT_JSON invalid JSON");
  }

  const projectId = obj.project_id || obj.projectId;
  const clientEmail = obj.client_email || obj.clientEmail;
  let privateKey = obj.private_key || obj.privateKey;
  if (typeof privateKey === "string") privateKey = privateKey.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = getServiceAccount();
  const projectId =
    sa?.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID;
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
      projectId: sa.projectId,
    });
    return admin.app();
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  return admin.app();
}

function normalizeEquipo(v) {
  const t = String(v || "").trim().toUpperCase();
  if (t === "ONT" || t === "MESH" || t === "FONO" || t === "BOX") return t;
  return null;
}

function normalizeYesNo(v) {
  const s = String(v || "").trim().toUpperCase();
  return s === "SI" ? "SI" : "NO";
}

function parseExcelDateToDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" && isFinite(v)) {
    const millis = Math.round((v - 25569) * 86400 * 1000);
    return new Date(millis);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = Number(m[3]);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) return new Date(yyyy, mm - 1, dd);
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function toLimaStrings(d) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { ymd, hm };
}

function limaLocalTimestampFrom(d) {
  const { ymd, hm } = toLimaStrings(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const utcMillis = Date.UTC(y, (m || 1) - 1, day || 1, (hh || 0) + 5, mm || 0, 0, 0);
  return admin.firestore.Timestamp.fromMillis(utcMillis);
}

function toDatePartsLima(d) {
  if (!d) return { at: null, ymd: null, hm: null };
  const { ymd, hm } = toLimaStrings(d);
  return { at: limaLocalTimestampFrom(d), ymd, hm };
}

function normalizeUbicacion(raw) {
  const base = String(raw || "").replace(/\s+/g, " ").trim();
  let up = base.toUpperCase();
  if (!up) up = "ALMACEN";

  const cuRegex = /^K\s*\d+\s+(MOTO|RESIDENCIAL)$/i;
  const isCuadrilla = cuRegex.test(base);
  const allowed = new Set(["ALMACEN", "AVERIA", "GARANTIA", "WIN", "PERDIDO", "ROBO", "INSTALADOS"]);

  let invalid = false;
  if (isCuadrilla) {
    const m = base.match(/^(K)\s*(\d+)\s+(MOTO|RESIDENCIAL)$/i);
    if (m) up = `K${m[2]} ${m[3].toUpperCase()}`;
  } else if (!allowed.has(up)) {
    invalid = up !== "ALMACEN";
    up = "ALMACEN";
  }

  let estado = "ALMACEN";
  if (isCuadrilla) estado = "CAMPO";
  else if (up === "ALMACEN") estado = "ALMACEN";
  else if (up === "AVERIA" || up === "GARANTIA") estado = "ALMACEN";
  else if (up === "WIN") estado = "WIN";
  else if (up === "PERDIDO" || up === "ROBO") estado = "DESCONTADOS";
  else if (up === "INSTALADOS") estado = "INSTALADO";

  return { ubicacion: up, estado, invalid };
}

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets["Hoja de Datos"] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("SHEET_NOT_FOUND");

  const rowsHeader = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!rowsHeader.length) throw new Error("INVALID_HEADERS");
  const headers = rowsHeader[0].map((x) => String(x || "").trim());
  const required = ["SN", "equipo", "descripcion"];
  for (const r of required) {
    if (!headers.includes(r)) throw new Error(`INVALID_HEADERS: missing ${r}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const seen = new Set();
  const candidates = new Map();

  let duplicadosInternosExcel = 0;
  let invalidas = 0;
  let ubicacionesInvalidas = 0;
  const conteoPorEquipo = { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };

  for (const r of rows) {
    const SN = String(r.SN || "").trim();
    if (!SN) {
      invalidas++;
      continue;
    }
    if (seen.has(SN)) {
      duplicadosInternosExcel++;
      continue;
    }

    const equipo = normalizeEquipo(r.equipo);
    const descripcion = String(r.descripcion || "").trim();
    if (!equipo || !descripcion) {
      invalidas++;
      continue;
    }

    const loc = normalizeUbicacion(r.ubicacion);
    if (loc.invalid) ubicacionesInvalidas++;

    const dIng = toDatePartsLima(parseExcelDateToDate(r.f_ingreso));
    const dDes = toDatePartsLima(parseExcelDateToDate(r.f_despacho));
    const dDev = toDatePartsLima(parseExcelDateToDate(r.f_devolucion));
    const dIns = toDatePartsLima(parseExcelDateToDate(r.f_instalado));

    const proIdRaw = String(r.proId || "").trim();
    const proId = equipo === "ONT" ? (proIdRaw ? proIdRaw : null) : undefined;
    const toS = (v) => String(v || "").trim();
    const tecnicos = String(r.tecnicos || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const doc = {
      SN,
      equipo,
      descripcion,
      proId,
      ubicacion: loc.ubicacion,
      estado: loc.estado,

      f_ingresoAt: dIng.at,
      f_ingresoYmd: dIng.ymd,
      f_ingresoHm: dIng.hm,
      f_despachoAt: dDes.at,
      f_despachoYmd: dDes.ymd,
      f_despachoHm: dDes.hm,
      f_devolucionAt: dDev.at,
      f_devolucionYmd: dDev.ymd,
      f_devolucionHm: dDev.hm,
      f_instaladoAt: dIns.at,
      f_instaladoYmd: dIns.ymd,
      f_instaladoHm: dIns.hm,

      guia_ingreso: toS(r.guia_ingreso),
      guia_despacho: toS(r.guia_despacho),
      guia_devolucion: toS(r.guia_devolucion),
      cliente: toS(r.cliente),
      codigoCliente: toS(r.codigoCliente),
      caso: toS(r.caso),
      observacion: toS(r.observacion),
      tecnicos,
      pri_tec: normalizeYesNo(r.pri_tec),
      tec_liq: normalizeYesNo(r.tec_liq),
      inv: normalizeYesNo(r.inv),
    };

    seen.add(SN);
    candidates.set(SN, doc);
    conteoPorEquipo[equipo]++;
  }

  return {
    totalRows: rows.length,
    duplicadosInternosExcel,
    invalidas,
    ubicacionesInvalidas,
    conteoPorEquipo,
    candidates,
  };
}

async function getExistingSNs(db, sns) {
  const out = new Set();
  const chunkSize = 300;
  for (let i = 0; i < sns.length; i += chunkSize) {
    const part = sns.slice(i, i + chunkSize);
    const refs = part.map((sn) => db.collection("equipos").doc(sn));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) if (snap.exists) out.add(snap.id);
    if ((i / chunkSize) % 20 === 0) {
      console.log(`- Revisando existentes: ${Math.min(i + chunkSize, sns.length)}/${sns.length}`);
    }
  }
  return out;
}

async function run() {
  const fileArg = getArg("file", "data equipos/Plantilla ingreso equipos.xlsx");
  const absPath = path.resolve(process.cwd(), fileArg);
  const dryRun = hasFlag("dry-run") || !hasFlag("execute");
  const noDbCheck = hasFlag("no-db-check");
  const actorUid = getArg("actor", "migration-script");
  const logEvery = Number(getArg("log-every", "1000")) || 1000;

  if (!fs.existsSync(absPath)) throw new Error(`FILE_NOT_FOUND: ${absPath}`);

  const stats = fs.statSync(absPath);
  console.log("Archivo:", absPath);
  console.log("Tamano:", `${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log("Modo:", dryRun ? "DRY_RUN" : "EXECUTE");

  const parsed = parseExcel(absPath);
  const sns = Array.from(parsed.candidates.keys());

  let db = null;
  let FieldValue = null;
  let existing = new Set();
  if (!noDbCheck) {
    initAdmin();
    db = admin.firestore();
    FieldValue = admin.firestore.FieldValue;
    existing = await getExistingSNs(db, sns);
  } else {
    console.log("ADVERTENCIA: --no-db-check activo, no se consultaran duplicados en Firestore.");
  }
  const nuevos = sns.filter((sn) => !existing.has(sn));

  console.log("Resumen analisis:");
  console.log(`- Filas Excel: ${parsed.totalRows}`);
  console.log(`- Candidatos validos: ${sns.length}`);
  console.log(`- Duplicados internos Excel: ${parsed.duplicadosInternosExcel}`);
  console.log(`- Filas invalidas: ${parsed.invalidas}`);
  console.log(`- Ubicaciones invalidas corregidas: ${parsed.ubicacionesInvalidas}`);
  console.log(`- Duplicados en BD: ${existing.size}`);
  console.log(`- Nuevos a crear: ${nuevos.length}`);
  console.log(`- Conteo por equipo: ${JSON.stringify(parsed.conteoPorEquipo)}`);

  if (dryRun || noDbCheck) {
    console.log("DRY_RUN finalizado. No se escribieron documentos.");
    return;
  }

  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    console.error("Write error:", err.documentRef?.path || "", err.code || "", err.message || "");
    return false;
  });

  let written = 0;
  const t0 = Date.now();
  for (const sn of nuevos) {
    const doc = parsed.candidates.get(sn);
    if (!doc) continue;
    const ref = db.collection("equipos").doc(sn);
    writer.set(
      ref,
      {
        ...omitUndefined(doc),
        sn_tail: String(sn).slice(-6),
        audit: {
          createdAt: FieldValue.serverTimestamp(),
          createdBy: actorUid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actorUid,
        },
      },
      { merge: false }
    );
    written++;
    if (written % logEvery === 0) {
      console.log(`- Encolados: ${written}/${nuevos.length}`);
    }
  }

  await writer.close();
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log("Importacion completada.");
  console.log(`- Escritos: ${written}`);
  console.log(`- Tiempo: ${elapsed}s`);
}

run().catch((err) => {
  console.error("ERROR:", err && err.message ? err.message : err);
  process.exit(1);
});
