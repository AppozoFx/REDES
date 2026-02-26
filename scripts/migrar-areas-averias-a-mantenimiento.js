/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

const OLD_AREA = "AVERIAS";
const NEW_AREA = "MANTENIMIENTO";

const PAGE_SIZE = 500;

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

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    execute: args.includes("--execute"),
  };
}

function replaceArray(arr) {
  if (!Array.isArray(arr)) return { next: arr, changed: false };
  let changed = false;
  const next = arr.map((v) => {
    if (String(v || "").toUpperCase() === OLD_AREA) {
      changed = true;
      return NEW_AREA;
    }
    return v;
  });
  return { next, changed };
}

async function migrateStringField(db, writer, colName, field, execute) {
  let updated = 0;
  let lastDoc = null;
  const FieldPath = admin.firestore.FieldPath;
  console.log(`\n[${colName}] ${field} == ${OLD_AREA}`);
  while (true) {
    let q = db.collection(colName).where(field, "==", OLD_AREA).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      updated += 1;
      if (execute) {
        writer.update(doc.ref, { [field]: NEW_AREA });
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`- encontrados: ${updated}`);
  }
  return updated;
}

async function migrateArrayField(db, writer, colName, field, execute) {
  let updated = 0;
  let lastDoc = null;
  const FieldPath = admin.firestore.FieldPath;
  console.log(`\n[${colName}] ${field} array-contains ${OLD_AREA}`);
  while (true) {
    let q = db.collection(colName).where(field, "array-contains", OLD_AREA).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const { next, changed } = replaceArray(data[field]);
      if (!changed) continue;
      updated += 1;
      if (execute) {
        writer.update(doc.ref, { [field]: next });
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`- encontrados: ${updated}`);
  }
  return updated;
}

async function main() {
  const { execute } = parseArgs();
  initAdmin();
  const db = admin.firestore();
  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    console.error("Write error:", err);
    return false;
  });

  console.log(`Migracion ${execute ? "EJECUTAR" : "DRY-RUN"}: ${OLD_AREA} -> ${NEW_AREA}`);

  const stats = [];

  stats.push(["usuarios", await migrateStringField(db, writer, "usuarios", "area", execute)]);
  stats.push(["usuarios_access", await migrateArrayField(db, writer, "usuarios_access", "areas", execute)]);
  stats.push(["roles", await migrateArrayField(db, writer, "roles", "areasDefault", execute)]);
  stats.push(["materiales", await migrateArrayField(db, writer, "materiales", "areas", execute)]);
  stats.push(["ventas", await migrateStringField(db, writer, "ventas", "area", execute)]);
  stats.push(["movimientos_inventario", await migrateStringField(db, writer, "movimientos_inventario", "area", execute)]);
  stats.push(["cuadrillas", await migrateStringField(db, writer, "cuadrillas", "area", execute)]);
  stats.push(["comunicados", await migrateArrayField(db, writer, "comunicados", "areasTarget", execute)]);

  if (execute) {
    await writer.flush();
  }
  await writer.close();

  console.log("\nResumen:");
  for (const [col, count] of stats) {
    console.log(`- ${col}: ${count}`);
  }
  console.log("\nListo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
