/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const MATERIAL_RENAMES = [
  { oldId: "PREFORME_NEGRO", newId: "PREFORME_24H", newName: "PREFORME 24H" },
  { oldId: "TERMOCONTRAIBLE", newId: "PROTECTOR_SMOV", newName: "PROTECTOR SMOV" },
];

const MOVE_TOP_LEVEL_COLLECTIONS = ["almacen_stock"];
const USER_SUBCOLLECTIONS = [
  "stock_ventas",
  "stock_materiales",
  "activos_asignados",
  "stock_materiales_mant",
  "activos_asignados_mant",
];
const CUADRILLA_SUBCOLLECTIONS = ["stock", "stock_ventas"];
const PATCH_TOP_LEVEL_COLLECTIONS = [
  "instalaciones",
  "ventas",
  "mantenimiento_liquidaciones",
  "movimientos_inventario",
];

function parseArgs(argv) {
  const args = {
    execute: false,
    verify: false,
    chunk: 300,
    updatedBy: process.env.MIGRACION_UPDATED_BY || "script-renombrar-materiales-ids",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--execute") args.execute = true;
    else if (a === "--dry-run") args.execute = false;
    else if (a === "--verify") args.verify = true;
    else if (a === "--chunk" && argv[i + 1]) args.chunk = Math.max(1, Math.min(450, Number(argv[++i]) || 300));
    else if (a === "--updated-by" && argv[i + 1]) args.updatedBy = String(argv[++i]).trim() || args.updatedBy;
  }
  return args;
}

function readServiceAccountFromEnvOrFile() {
  const envJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.TARGET_FIREBASE_SERVICE_ACCOUNT_JSON ||
    "";

  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch {
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  }

  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps", "web", ".env.local"),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    const m = txt.match(/^FIREBASE_SERVICE_ACCOUNT_JSON=(\{.*\})$/m);
    if (!m) continue;
    return JSON.parse(m[1]);
  }

  throw new Error("Service account not found in env or .env.local");
}

function readEnvFileVars() {
  const out = {};
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps", "web", ".env.local"),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in out)) out[key] = value;
    }
  }

  return out;
}

function readServiceAccountFromSplitVars() {
  const envFileVars = readEnvFileVars();
  const clientEmail =
    process.env.ADMIN_CLIENT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    envFileVars.ADMIN_CLIENT_EMAIL ||
    envFileVars.GOOGLE_CLIENT_EMAIL ||
    envFileVars.FIREBASE_CLIENT_EMAIL ||
    "";
  let privateKey =
    process.env.ADMIN_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    envFileVars.ADMIN_PRIVATE_KEY ||
    envFileVars.GOOGLE_PRIVATE_KEY ||
    envFileVars.FIREBASE_PRIVATE_KEY ||
    "";
  const projectId =
    process.env.ADMIN_PROJECT_ID ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    envFileVars.ADMIN_PROJECT_ID ||
    envFileVars.GOOGLE_PROJECT_ID ||
    envFileVars.FIREBASE_PROJECT_ID ||
    envFileVars.GCLOUD_PROJECT ||
    envFileVars.GOOGLE_CLOUD_PROJECT ||
    "";

  privateKey = String(privateKey || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey || !privateKey.includes("BEGIN PRIVATE KEY")) return null;
  return { projectId, clientEmail, privateKey };
}

function initDb() {
  let sa = null;
  try {
    sa = readServiceAccountFromEnvOrFile();
  } catch {}
  if (!sa) sa = readServiceAccountFromSplitVars();
  if (!admin.apps.length) {
    if (sa) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: sa.project_id || sa.projectId,
          clientEmail: sa.client_email || sa.clientEmail,
          privateKey: String(sa.private_key || sa.privateKey || "").replace(/\\n/g, "\n"),
        }),
        projectId: sa.project_id || sa.projectId,
      });
    } else {
      const envFileVars = readEnvFileVars();
      const projectId =
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        envFileVars.GCLOUD_PROJECT ||
        envFileVars.GOOGLE_CLOUD_PROJECT ||
        envFileVars.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        "redes-5bb81";

      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    }
  }
  return admin.firestore();
}

function stripDiacritics(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã±/gi, (m) => (m === "Ã±" ? "n" : "N"));
}

function nombreNorm(nombre) {
  const low = stripDiacritics(String(nombre || "").trim().toLowerCase());
  return low.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out;
  }
  return value;
}

function chunked(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function mapFromRenames(renames) {
  const byOld = new Map();
  const oldIds = [];
  for (const item of renames) {
    byOld.set(item.oldId, item);
    oldIds.push(item.oldId);
  }
  return { byOld, oldIds };
}

function shouldReplaceIdKey(pathParts, obj) {
  const last = pathParts[pathParts.length - 1] || "";
  if (last === "itemsMateriales" || last === "materialesConsumidos" || last === "items") return true;
  if (obj && typeof obj === "object" && "materialId" in obj) return true;
  return false;
}

function replaceMaterialReferences(value, byOld, pathParts = []) {
  let changed = false;

  if (Array.isArray(value)) {
    const arr = value.map((item) => {
      const next = replaceMaterialReferences(item, byOld, pathParts);
      if (next.changed) changed = true;
      return next.value;
    });
    return { value: changed ? arr : value, changed };
  }

  if (!isPlainObject(value)) {
    return { value, changed: false };
  }

  const out = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    let key = rawKey;
    const renameByKey = byOld.get(rawKey);
    if (renameByKey) {
      key = renameByKey.newId;
      changed = true;
    }

    let nextVal = rawVal;
    if (typeof rawVal === "string") {
      if (rawKey === "materialId" && byOld.has(rawVal)) {
        nextVal = byOld.get(rawVal).newId;
        changed = true;
      } else if (rawKey === "id" && byOld.has(rawVal) && shouldReplaceIdKey(pathParts, value)) {
        nextVal = byOld.get(rawVal).newId;
        changed = true;
      }
    } else {
      const next = replaceMaterialReferences(rawVal, byOld, pathParts.concat([key]));
      if (next.changed) changed = true;
      nextVal = next.value;
    }

    out[key] = nextVal;
  }

  return { value: changed ? out : value, changed };
}

async function scanTopLevelCollection(db, collectionName, byOld) {
  const summary = { scanned: 0, matched: 0, docs: [] };
  let lastDoc = null;

  while (true) {
    let q = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(400);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      summary.scanned += 1;
      const data = doc.data() || {};
      const next = replaceMaterialReferences(data, byOld, [collectionName]);
      if (!next.changed) continue;
      summary.matched += 1;
      summary.docs.push({ ref: doc.ref, data: next.value });
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return summary;
}

async function listDocRefs(db, collectionName) {
  const refs = [];
  let lastDoc = null;

  while (true) {
    let q = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(400);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.select().get();
    if (snap.empty) break;
    refs.push(...snap.docs.map((doc) => doc.ref));
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return refs;
}

async function scanParentSubcollections(parentRefs, subcollections, renames, updatedBy) {
  const ops = [];
  const counts = {};

  for (const subcollection of subcollections) counts[subcollection] = 0;

  for (const parentRef of parentRefs) {
    for (const rename of renames) {
      const refs = subcollections.map((subcollection) => parentRef.collection(subcollection).doc(rename.oldId));
      const snaps = refs.length ? await parentRef.firestore.getAll(...refs) : [];

      for (let i = 0; i < refs.length; i += 1) {
        const oldRef = refs[i];
        const oldSnap = snaps[i];
        if (!oldSnap?.exists) continue;

        const newRef = oldRef.parent.doc(rename.newId);
        const newSnap = await newRef.get();
        if (newSnap.exists) {
          ops.push({ conflict: `${oldRef.path} -> ${newRef.path}` });
          continue;
        }

        counts[oldRef.parent.id] = (counts[oldRef.parent.id] || 0) + 1;
        ops.push({
          oldRef,
          newRef,
          data: {
            ...deepClone(oldSnap.data() || {}),
            materialId: rename.newId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy,
          },
        });
      }
    }
  }

  return { ops, counts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = initDb();
  const { byOld, oldIds } = mapFromRenames(MATERIAL_RENAMES);

  if (args.verify) {
    const verify = {
      materials: [],
      almacenStock: [],
      nestedOldLeft: {},
      embeddedOldLeft: {},
    };

    for (const rename of MATERIAL_RENAMES) {
      const [oldMat, newMat, oldStock, newStock] = await db.getAll(
        db.collection("materiales").doc(rename.oldId),
        db.collection("materiales").doc(rename.newId),
        db.collection("almacen_stock").doc(rename.oldId),
        db.collection("almacen_stock").doc(rename.newId)
      );
      verify.materials.push({
        oldId: rename.oldId,
        oldExists: oldMat.exists,
        newId: rename.newId,
        newExists: newMat.exists,
        newNombre: newMat.exists ? String((newMat.data() || {}).nombre || "") : "",
      });
      verify.almacenStock.push({
        oldId: rename.oldId,
        oldExists: oldStock.exists,
        newId: rename.newId,
        newExists: newStock.exists,
      });
    }

    const [userRefs, cuadrillaRefs] = await Promise.all([
      listDocRefs(db, "usuarios"),
      listDocRefs(db, "cuadrillas"),
    ]);

    for (const subcollection of USER_SUBCOLLECTIONS) verify.nestedOldLeft[subcollection] = 0;
    for (const subcollection of CUADRILLA_SUBCOLLECTIONS) verify.nestedOldLeft[subcollection] = 0;

    for (const parentRef of [...userRefs, ...cuadrillaRefs]) {
      const subcollections = parentRef.parent.id === "usuarios" ? USER_SUBCOLLECTIONS : CUADRILLA_SUBCOLLECTIONS;
      for (const subcollection of subcollections) {
        for (const oldId of oldIds) {
          const snap = await parentRef.collection(subcollection).doc(oldId).get();
          if (snap.exists) verify.nestedOldLeft[subcollection] += 1;
        }
      }
    }

    for (const collectionName of PATCH_TOP_LEVEL_COLLECTIONS) {
      const result = await scanTopLevelCollection(db, collectionName, byOld);
      verify.embeddedOldLeft[collectionName] = result.matched;
    }

    console.log("=== Verificacion Renombrar Materiales IDs ===");
    console.log(JSON.stringify(verify, null, 2));
    return;
  }

  const summary = {
    execute: args.execute,
    renames: MATERIAL_RENAMES,
    validations: {
      materialsOldFound: [],
      materialsNewAlreadyExist: [],
      stockNewAlreadyExist: [],
      moveConflicts: [],
    },
    counts: {
      materialDocsToCreate: 0,
      materialDocsToDelete: 0,
      topLevelMoves: {},
      nestedMoves: {},
      patchedTopLevelDocs: {},
    },
    samples: {
      topLevelMoves: [],
      nestedMoves: [],
      patchedTopLevelDocs: [],
    },
  };

  const materialOps = [];
  const topLevelMoveOps = [];
  const nestedMoveOps = [];
  const patchOps = [];

  for (const rename of MATERIAL_RENAMES) {
    const oldRef = db.collection("materiales").doc(rename.oldId);
    const newRef = db.collection("materiales").doc(rename.newId);
    const [oldSnap, newSnap] = await db.getAll(oldRef, newRef);

    if (!oldSnap.exists) throw new Error(`Material origen no existe: ${rename.oldId}`);
    summary.validations.materialsOldFound.push(rename.oldId);
    if (newSnap.exists) summary.validations.materialsNewAlreadyExist.push(rename.newId);

    const oldData = oldSnap.data() || {};
    materialOps.push({
      createRef: newRef,
      deleteRef: oldRef,
      data: {
        ...deepClone(oldData),
        id: rename.newId,
        nombre: rename.newName,
        nombreNorm: nombreNorm(rename.newName),
        audit: {
          ...(isPlainObject(oldData.audit) ? deepClone(oldData.audit) : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: args.updatedBy,
        },
      },
    });
  }

  for (const collectionName of MOVE_TOP_LEVEL_COLLECTIONS) {
    const ops = [];
    for (const rename of MATERIAL_RENAMES) {
      const oldRef = db.collection(collectionName).doc(rename.oldId);
      const newRef = db.collection(collectionName).doc(rename.newId);
      const [oldSnap, newSnap] = await db.getAll(oldRef, newRef);
      if (newSnap.exists) summary.validations.stockNewAlreadyExist.push(`${collectionName}/${rename.newId}`);
      if (!oldSnap.exists) continue;
      ops.push({
        oldRef,
        newRef,
        data: {
          ...deepClone(oldSnap.data() || {}),
          materialId: rename.newId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: args.updatedBy,
        },
      });
    }
    topLevelMoveOps.push(...ops);
    summary.counts.topLevelMoves[collectionName] = ops.length;
    summary.samples.topLevelMoves.push(...ops.slice(0, 5).map((op) => ({ from: op.oldRef.path, to: op.newRef.path })));
  }

  const [userRefs, cuadrillaRefs] = await Promise.all([
    listDocRefs(db, "usuarios"),
    listDocRefs(db, "cuadrillas"),
  ]);

  const userScan = await scanParentSubcollections(userRefs, USER_SUBCOLLECTIONS, MATERIAL_RENAMES, args.updatedBy);
  const cuadrillaScan = await scanParentSubcollections(cuadrillaRefs, CUADRILLA_SUBCOLLECTIONS, MATERIAL_RENAMES, args.updatedBy);

  for (const item of [...userScan.ops, ...cuadrillaScan.ops]) {
    if (item.conflict) {
      summary.validations.moveConflicts.push(item.conflict);
      continue;
    }
    nestedMoveOps.push({
      oldRef: item.oldRef,
      newRef: item.newRef,
      data: {
        ...item.data,
        updatedBy: args.updatedBy,
      },
    });
  }

  summary.counts.nestedMoves = {
    ...userScan.counts,
    ...Object.fromEntries(
      Object.entries(cuadrillaScan.counts).map(([k, v]) => [k, (userScan.counts[k] || 0) + v])
    ),
  };
  summary.samples.nestedMoves.push(
    ...nestedMoveOps.slice(0, 10).map((op) => ({ from: op.oldRef.path, to: op.newRef.path }))
  );

  for (const collectionName of PATCH_TOP_LEVEL_COLLECTIONS) {
    const result = await scanTopLevelCollection(db, collectionName, byOld);
    patchOps.push(...result.docs.map((item) => ({ ...item, collectionName })));
    summary.counts.patchedTopLevelDocs[collectionName] = result.matched;
    summary.counts.patchedTopLevelDocs[`${collectionName}__scanned`] = result.scanned;
    summary.samples.patchedTopLevelDocs.push(
      ...result.docs.slice(0, 5).map((item) => ({ path: item.ref.path, collection: collectionName }))
    );
  }

  summary.counts.materialDocsToCreate = materialOps.length;
  summary.counts.materialDocsToDelete = materialOps.length;

  const hasConflicts =
    summary.validations.materialsNewAlreadyExist.length > 0 ||
    summary.validations.stockNewAlreadyExist.length > 0 ||
    summary.validations.moveConflicts.length > 0;

  console.log("=== Renombrar Materiales IDs ===");
  console.log(JSON.stringify(summary, null, 2));

  if (hasConflicts) {
    console.log("\nSe detectaron conflictos. No se aplicaron cambios.");
    process.exitCode = 2;
    return;
  }

  if (!args.execute) {
    console.log("\nDry-run: sin cambios. Usa --execute para aplicar.");
    return;
  }

  const writes = [];
  for (const op of materialOps) {
    writes.push({ type: "set", ref: op.createRef, data: op.data });
    writes.push({ type: "delete", ref: op.deleteRef });
  }
  for (const op of topLevelMoveOps) {
    writes.push({ type: "set", ref: op.newRef, data: op.data });
    writes.push({ type: "delete", ref: op.oldRef });
  }
  for (const op of nestedMoveOps) {
    writes.push({ type: "set", ref: op.newRef, data: op.data });
    writes.push({ type: "delete", ref: op.oldRef });
  }
  for (const op of patchOps) {
    writes.push({
      type: "set",
      ref: op.ref,
      data: {
        ...op.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: args.updatedBy,
      },
    });
  }

  let written = 0;
  for (const part of chunked(writes, args.chunk)) {
    const batch = db.batch();
    for (const item of part) {
      if (item.type === "delete") batch.delete(item.ref);
      else batch.set(item.ref, item.data);
    }
    await batch.commit();
    written += part.length;
    console.log(`Aplicado ${written}/${writes.length}`);
  }

  console.log("\nMigracion completada.");
  console.log(
    JSON.stringify(
      {
        writtenOps: written,
        materialsMoved: materialOps.length,
        topLevelMoved: topLevelMoveOps.length,
        nestedMoved: nestedMoveOps.length,
        docsPatched: patchOps.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
