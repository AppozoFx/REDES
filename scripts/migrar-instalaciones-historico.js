/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

function parseArgs(argv) {
  const args = {
    from: "2025-01-01",
    to: "2026-01-01",
    dryRun: true,
    overwrite: false,
    chunk: 400,
    updatedBy: process.env.MIGRACION_UPDATED_BY || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) args.from = String(argv[++i]).trim();
    else if (a === "--to" && argv[i + 1]) args.to = String(argv[++i]).trim();
    else if (a === "--execute") args.dryRun = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--overwrite") args.overwrite = true;
    else if (a === "--chunk" && argv[i + 1]) args.chunk = Math.max(1, Math.min(450, Number(argv[++i]) || 400));
    else if (a === "--updated-by" && argv[i + 1]) args.updatedBy = String(argv[++i]).trim();
  }
  return args;
}

function getJsonEnv(candidates) {
  for (const key of candidates) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${key} has invalid JSON`);
    }
  }
  return null;
}

function parseServiceAccount(obj) {
  if (!obj || typeof obj !== "object") return null;
  const projectId = obj.project_id || obj.projectId;
  const clientEmail = obj.client_email || obj.clientEmail;
  let privateKey = obj.private_key || obj.privateKey;
  if (typeof privateKey === "string") privateKey = privateKey.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function initDb(appName, sa) {
  const app = admin.initializeApp(
    {
      credential: admin.credential.cert({
        projectId: sa.projectId,
        clientEmail: sa.clientEmail,
        privateKey: sa.privateKey,
      }),
      projectId: sa.projectId,
    },
    appName
  );
  return admin.firestore(app);
}

function asIsoString(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return "";
    }
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  if (v instanceof Date) return v.toISOString();
  return "";
}

function asDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate();
    } catch {
      return null;
    }
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ymdFromAny(v) {
  const s = asIsoString(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = asDate(v);
  if (!d) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function hmFromAny(v) {
  const s = asIsoString(v);
  if (s.length >= 16 && s[10] === "T") return s.slice(11, 16);
  const d = asDate(v);
  if (!d) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function ymdLimaFromDate(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function hmLimaFromDate(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildEquipos(data) {
  const out = [];
  if (data.snONT) out.push({ tipo: "ONT", sn: String(data.snONT), proid: String(data.proidONT || "") });
  for (const sn of normalizeArray(data.snMESH).slice(0, 10)) out.push({ tipo: "MESH", sn: String(sn) });
  for (const sn of normalizeArray(data.snBOX).slice(0, 10)) out.push({ tipo: "BOX", sn: String(sn) });
  if (data.snFONO) out.push({ tipo: "FONO", sn: String(data.snFONO) });
  return out;
}

function numOrString(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return s;
}

function mapDoc(docId, data, args) {
  const codigoCliente = String(data.codigoCliente || docId || "").trim();
  if (!codigoCliente) return null;

  const fechaBase =
    data.fechaInstalacion ||
    data.fechaLiquidacion ||
    data.fecha ||
    data.createdAt ||
    data.updatedAt ||
    null;
  const fechaInstDate = asDate(fechaBase);
  const ymd = ymdLimaFromDate(fechaInstDate) || ymdFromAny(fechaBase);
  const hm = hmLimaFromDate(fechaInstDate) || hmFromAny(fechaBase);

  const planGamer = String(data.planGamer || "").trim();
  const kitWifiPro = String(data.kitWifiPro || "").trim();
  const servicioCableadoMesh = String(data.servicioCableadoMesh || "").trim();
  const cat5e = normalizeNumber(data.cat5e);
  const cat6 = normalizeNumber(data.cat6 || (planGamer ? 1 : 0));
  const puntosUTP = normalizeNumber(data.puntosUTP || cat5e + cat6);

  const equiposInstalados = buildEquipos(data);
  const liquidacionAtDate = asDate(data.fechaLiquidacion) || asDate(fechaBase);
  const estadoRaw = String(data.estadoLiquidacion || data.liquidacion?.estado || "").toUpperCase();
  const estadoLiq = estadoRaw === "PENDIENTE" ? "PENDIENTE" : "LIQUIDADO";
  const nroDoc = numOrString(data.documento);
  const phone = numOrString(data.telefono);
  const codigoNum = numOrString(codigoCliente);
  const tipoCuadrilla = String(data.tipoCuadrilla || "Regular").trim() || "Regular";
  const acta = String(data.acta || data.ACTA || "").trim();

  return {
    id: codigoCliente,
    payload: {
      codigoCliente,
      cliente: String(data.cliente || "").trim(),
      direccion: String(data.direccion || "").trim(),
      documento: nroDoc,
      telefono: phone,
      plan: String(data.plan || "").trim(),
      ACTA: acta,
      cuadrillaNombre: String(data.cuadrillaNombre || "").trim(),
      tipoCuadrilla,
      fechaInstalacionAt: fechaInstDate || null,
      fechaInstalacionYmd: ymd,
      fechaInstalacionHm: hm,
      fechaOrdenYmd: ymd,
      orden: {
        codiSeguiClien: codigoNum || codigoCliente,
        cliente: String(data.cliente || "").trim(),
        direccion: String(data.direccion || "").trim(),
        direccion1: String(data.direccion || "").trim(),
        numeroDocumento: nroDoc,
        cuadrillaNombre: String(data.cuadrillaNombre || "").trim(),
        tipoCuadrilla,
        idenServi: codigoNum || codigoCliente,
        fechaFinVisiYmd: ymd,
        fechaFinVisiHm: hm,
        fechaFinVisiAt: fechaInstDate || null,
        tipoTraba: "INSTALACION",
        tipoOrden: String(data.residencialCondominio || data.tipoOrden || "").trim(),
        telefono: phone,
        coordinadorCuadrilla: String(data.coordinadorCuadrilla || "").trim(),
        gestorCuadrilla: String(data.gestorCuadrilla || "").trim(),
      },
      servicios: {
        cat5e,
        cat6,
        puntosUTP,
        ...(planGamer ? { planGamer } : {}),
        ...(kitWifiPro ? { kitWifiPro } : {}),
        ...(servicioCableadoMesh ? { servicioCableadoMesh } : {}),
      },
      liquidacion: {
        estado: estadoLiq,
        ymd,
        hm,
        at: liquidacionAtDate || null,
        by: String(data.usuario || data.uid || "").trim(),
        rotuloNapCto: String(data.rotuloNapCto || "").trim(),
        observacion: String(data.observacion || "").trim(),
        servicios: {
          cat5e,
          cat6,
          puntosUTP,
          ...(planGamer ? { planGamer } : {}),
          ...(kitWifiPro ? { kitWifiPro } : {}),
          ...(servicioCableadoMesh ? { servicioCableadoMesh } : {}),
        },
      },
      snONT: String(data.snONT || "").trim(),
      proidONT: String(data.proidONT || "").trim(),
      snMESH: normalizeArray(data.snMESH),
      snBOX: normalizeArray(data.snBOX),
      snFONO: String(data.snFONO || "").trim(),
      materialesLiquidacion: {
        templador: normalizeNumber(data.templador || 0),
        acta: acta,
        bobinaMetros: normalizeNumber(data.metraje_instalado || data.bobinaMetros || 30),
        clevi: normalizeNumber(data.clevi || 0),
      },
      observacion: String(data.observacion || "").trim(),
      updatedBy: args.updatedBy || String(data.usuarioUid || "").trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromIso = `${args.from}T00:00:00.000Z`;
  const toIso = `${args.to}T00:00:00.000Z`;

  const sourceSaRaw = getJsonEnv([
    "SOURCE_FIREBASE_SERVICE_ACCOUNT_JSON",
    "LIQUIDACION_SOURCE_SERVICE_ACCOUNT_JSON",
  ]);
  const targetSaRaw = getJsonEnv([
    "TARGET_FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "ADMIN_SERVICE_ACCOUNT_JSON",
  ]);

  const sourceSa = parseServiceAccount(sourceSaRaw);
  const targetSa = parseServiceAccount(targetSaRaw);

  if (!sourceSa) {
    throw new Error(
      "Missing source credentials. Set SOURCE_FIREBASE_SERVICE_ACCOUNT_JSON (service account JSON for redesmyd-app)."
    );
  }
  if (!targetSa) {
    throw new Error(
      "Missing target credentials. Set TARGET_FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON (service account JSON for REDES)."
    );
  }

  const sourceDb = initDb("source-migracion-instalaciones", sourceSa);
  const targetDb = initDb("target-migracion-instalaciones", targetSa);

  const summary = {
    from: args.from,
    to: args.to,
    dryRun: args.dryRun,
    overwrite: args.overwrite,
    scanned: 0,
    prepared: 0,
    toWrite: 0,
    skippedNoId: 0,
    skippedExists: 0,
    written: 0,
  };

  const prepared = [];
  let lastDoc = null;
  const pageSize = 500;

  console.log("Leyendo origen liquidacion_instalaciones...");
  while (true) {
    let q = sourceDb
      .collection("liquidacion_instalaciones")
      .where("fechaInstalacion", ">=", fromIso)
      .where("fechaInstalacion", "<", toIso)
      .orderBy("fechaInstalacion", "asc")
      .limit(pageSize);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      summary.scanned += 1;
      const mapped = mapDoc(d.id, d.data() || {}, args);
      if (!mapped) {
        summary.skippedNoId += 1;
        continue;
      }
      prepared.push(mapped);
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  summary.prepared = prepared.length;
  if (!prepared.length) {
    console.log("No se encontraron documentos en el rango.");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const existing = new Set();
  for (let i = 0; i < prepared.length; i += args.chunk) {
    const part = prepared.slice(i, i + args.chunk);
    const refs = part.map((x) => targetDb.collection("instalaciones").doc(x.id));
    const snaps = await targetDb.getAll(...refs);
    for (const s of snaps) if (s.exists) existing.add(s.id);
  }

  const finalWrites = prepared.filter((x) => {
    const exists = existing.has(x.id);
    if (exists && !args.overwrite) {
      summary.skippedExists += 1;
      return false;
    }
    return true;
  });

  summary.toWrite = finalWrites.length;

  console.log("Resumen previo:");
  console.log(JSON.stringify(summary, null, 2));

  if (args.dryRun) {
    console.log("Dry run activo. No se escribieron cambios.");
    return;
  }

  for (let i = 0; i < finalWrites.length; i += args.chunk) {
    const part = finalWrites.slice(i, i + args.chunk);
    const batch = targetDb.batch();
    for (const item of part) {
      const ref = targetDb.collection("instalaciones").doc(item.id);
      batch.set(ref, item.payload, { merge: true });
    }
    await batch.commit();
    summary.written += part.length;
    console.log(`Escritos ${summary.written}/${summary.toWrite}`);
  }

  console.log("Migracion finalizada.");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
