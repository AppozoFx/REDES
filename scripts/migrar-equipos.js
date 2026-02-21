/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required");
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalid JSON");
  }
  const projectId = obj.project_id || obj.projectId;
  let privateKey = obj.private_key || obj.privateKey;
  const clientEmail = obj.client_email || obj.clientEmail;
  if (typeof privateKey === "string") {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }
  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  }
  return { projectId, clientEmail, privateKey };
}

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = getServiceAccount();
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

function normalizeUbicacion(raw) {
  const base = String(raw || "").replace(/\s+/g, " ").trim();
  let up = base.toUpperCase();
  if (!up) up = "ALMACEN";
  const cuRegex = /^K\s*\d+\s+(MOTO|RESIDENCIAL)$/i;
  const isCuadrilla = cuRegex.test(base);
  let invalid = false;
  if (isCuadrilla) {
    const m = base.match(/^(K)\s*(\d+)\s+(MOTO|RESIDENCIAL)$/i);
    if (m) up = `K${m[2]} ${m[3].toUpperCase()}`;
  } else {
    const allowed = new Set(["ALMACEN", "AVERIA", "GARANTIA", "WIN", "PERDIDO", "ROBO", "INSTALADOS"]);
    if (!allowed.has(up)) {
      invalid = up !== "ALMACEN";
      up = "ALMACEN";
    }
  }
  let estado = "ALMACEN";
  if (isCuadrilla) estado = "CAMPO";
  else if (up === "ALMACEN") estado = "ALMACEN";
  else if (up === "AVERIA" || up === "GARANTIA") estado = "ALMACEN";
  else if (up === "WIN") estado = "WIN";
  else if (up === "PERDIDO" || up === "ROBO") estado = "DESCONTADOS";
  else if (up === "INSTALADOS") estado = "INSTALADO";
  return { ubicacion: up, estado, invalid, isCuadrilla };
}

function toCuadrillaIdFromNombre(nombre) {
  return String(nombre || "").trim().replace(/\s+/g, "_").toUpperCase();
}

const KIT_BASE_POR_ONT = {
  ACTA: 1,
  CONECTOR: 1,
  ROSETA: 1,
  ACOPLADOR: 1,
  PACHCORD: 1,
  CINTILLO_30: 4,
  CINTILLO_BANDERA: 1,
};

async function main() {
  initAdmin();
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const args = process.argv.slice(2);
  const skipSeries = args.includes("--skip-series");
  const forceKit = args.includes("--force-kit");
  const ensureKitStock = args.includes("--ensure-kit-stock");

  const cuadrillaIdCache = new Map(); // nombre -> id | null
  const cuadrillaExistsCache = new Map(); // id -> boolean
  const materialesCache = new Map(); // id -> unidadTipo | null

  async function resolveCuadrillaId(nombre) {
    if (cuadrillaIdCache.has(nombre)) return cuadrillaIdCache.get(nombre);
    const idGuess = toCuadrillaIdFromNombre(nombre);
    if (!cuadrillaExistsCache.has(idGuess)) {
      const snap = await db.collection("cuadrillas").doc(idGuess).get();
      cuadrillaExistsCache.set(idGuess, snap.exists);
    }
    if (cuadrillaExistsCache.get(idGuess)) {
      cuadrillaIdCache.set(nombre, idGuess);
      return idGuess;
    }
    const q = await db.collection("cuadrillas").where("nombre", "==", nombre).limit(1).get();
    const id = q.empty ? null : q.docs[0].id;
    cuadrillaIdCache.set(nombre, id);
    return id;
  }

  async function getUnidadTipo(materialId) {
    if (materialesCache.has(materialId)) return materialesCache.get(materialId);
    const snap = await db.collection("materiales").doc(materialId).get();
    const unidadTipo = snap.exists ? String(snap.data().unidadTipo || "") : null;
    materialesCache.set(materialId, unidadTipo);
    return unidadTipo;
  }

  const countsByCuadrilla = new Map(); // id -> { total, tipos: Map<tipo, count>, onts }
  let processed = 0;
  let skippedNoCuadrilla = 0;
  let skippedNoCuadrillaDoc = 0;

  const seriesCandidates = []; // { ref, payload }

  let lastDoc = null;
  const pageSize = 500;
  console.log("Escaneando equipos...");
  while (true) {
    let q = db.collection("equipos").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      processed++;
      const data = doc.data() || {};
      const sn = String(data.SN || doc.id || "").trim();
      if (!sn) continue;
      const loc = normalizeUbicacion(data.ubicacion);
      if (!loc.isCuadrilla) {
        skippedNoCuadrilla++;
        continue;
      }
      const cuadrillaNombre = loc.ubicacion;
      const cuadrillaId = await resolveCuadrillaId(cuadrillaNombre);
      if (!cuadrillaId) {
        skippedNoCuadrillaDoc++;
        continue;
      }

      const tipo = String(data.equipo || "UNKNOWN").toUpperCase();
      const desc = String(data.descripcion || "");

      if (!countsByCuadrilla.has(cuadrillaId)) {
        countsByCuadrilla.set(cuadrillaId, { total: 0, onts: 0, tipos: new Map() });
      }
      const c = countsByCuadrilla.get(cuadrillaId);
      c.total += 1;
      c.tipos.set(tipo, (c.tipos.get(tipo) || 0) + 1);
      if (tipo === "ONT") c.onts += 1;

      if (!skipSeries) {
        const seriesRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn);
        const payload = {
          SN: sn,
          equipo: tipo,
          descripcion: desc,
          ubicacion: loc.ubicacion,
          estado: "CAMPO",
          guia_despacho: "",
          updatedAt: FieldValue.serverTimestamp(),
        };
        seriesCandidates.push({ ref: seriesRef, payload });
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`Procesados: ${processed}`);
  }

  if (!skipSeries) {
    console.log("Creando equipos_series (solo faltantes)...");
    const writerSeries = db.bulkWriter();
    writerSeries.onWriteError((err) => {
      console.error("Write error (series):", err);
      return false;
    });
    const chunkSize = 300;
    for (let i = 0; i < seriesCandidates.length; i += chunkSize) {
      const part = seriesCandidates.slice(i, i + chunkSize);
      const refs = part.map((x) => x.ref);
      const snaps = await db.getAll(...refs);
      const existsSet = new Set(snaps.filter((s) => s.exists).map((s) => s.ref.path));
      for (const item of part) {
        if (existsSet.has(item.ref.path)) continue;
        writerSeries.create(item.ref, item.payload);
      }
      await writerSeries.flush();
    }
    await writerSeries.close();
  }

  console.log("Actualizando equipos_stock y kit por ONT...");
  const writerStock = db.bulkWriter();
  writerStock.onWriteError((err) => {
    console.error("Write error (stock):", err);
    return false;
  });
  const fixedTipos = ["ONT", "MESH", "BOX", "FONO"];
  for (const [cuadrillaId, c] of countsByCuadrilla.entries()) {
    // equipos_stock exacto
    const tiposSet = new Set([...fixedTipos, ...c.tipos.keys()]);
    for (const tipo of tiposSet) {
      const cantidad = c.tipos.get(tipo) || 0;
      const ref = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_stock").doc(tipo);
      writerStock.set(
        ref,
        { tipo, cantidad, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    // kit por ONT (idempotente por delta via marcador)
    if (c.onts > 0 || ensureKitStock) {
      const markRef = db.collection("migraciones").doc("ont_kit_v1").collection("cuadrillas").doc(cuadrillaId);
      const markSnap = forceKit ? null : await markRef.get();
      let prevAppliedOnts = 0;
      if (markSnap?.exists) {
        const raw = markSnap.data()?.ontCount;
        // Compatibilidad: si existe marcador antiguo sin ontCount, asumimos que ya se aplico al conteo actual.
        const parsed = Number(raw);
        prevAppliedOnts = Number.isFinite(parsed) ? parsed : c.onts;
      }
      const ontDelta = forceKit ? c.onts : Math.max(0, c.onts - prevAppliedOnts);

      const matIds = Object.keys(KIT_BASE_POR_ONT);
      const stockRefs = matIds.map((matId) =>
        db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(matId)
      );
      const stockSnaps = await db.getAll(...stockRefs);
      const stockMap = new Map(stockSnaps.map((s) => [s.id, s]));

      for (const [matId, perOnt] of Object.entries(KIT_BASE_POR_ONT)) {
        const unidadTipo = await getUnidadTipo(matId);
        if (!unidadTipo) {
          console.warn(`Material no encontrado: ${matId}`);
          continue;
        }
        const matRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(matId);
        const base = { materialId: matId, unidadTipo, area: "CUADRILLA" };
        const stockSnap = stockMap.get(matId);

        if (!stockSnap?.exists) {
          // create missing stock doc with 0
          if (unidadTipo === "UND") {
            writerStock.set(matRef, { ...base, stockUnd: 0 }, { merge: true });
          } else {
            writerStock.set(matRef, { ...base, stockCm: 0 }, { merge: true });
          }
        }

        if (ontDelta > 0) {
          if (unidadTipo === "UND") {
            writerStock.set(matRef, { ...base, stockUnd: FieldValue.increment(perOnt * ontDelta) }, { merge: true });
          } else {
            // fallback: no deberia pasar en este kit
            writerStock.set(matRef, { ...base, stockCm: FieldValue.increment(perOnt * ontDelta) }, { merge: true });
          }
        }
      }

      if (ontDelta > 0 || forceKit || !markSnap?.exists) {
        writerStock.set(
          markRef,
          { appliedAt: FieldValue.serverTimestamp(), ontCount: forceKit ? c.onts : Math.max(prevAppliedOnts, c.onts) },
          { merge: true }
        );
      }
    }
  }

  await writerStock.close();

  console.log("Resumen:");
  console.log(`- Equipos procesados: ${processed}`);
  console.log(`- Saltados (no cuadrilla): ${skippedNoCuadrilla}`);
  console.log(`- Saltados (cuadrilla no existe): ${skippedNoCuadrillaDoc}`);
  console.log(`- Cuadrillas afectadas: ${countsByCuadrilla.size}`);
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
