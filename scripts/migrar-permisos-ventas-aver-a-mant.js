/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

const OLD_PERM = "VENTAS_DESPACHO_AVER";
const NEW_PERM = "VENTAS_DESPACHO_MANT";
const OLD_TIPO = "VENTA_AVER";
const NEW_TIPO = "VENTA_MANT";

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

function replaceArray(arr, oldValue, newValue) {
  if (!Array.isArray(arr)) return { next: arr, changed: false };
  let changed = false;
  const next = arr.map((v) => {
    if (String(v || "").toUpperCase() === oldValue) {
      changed = true;
      return newValue;
    }
    return v;
  });
  return { next, changed };
}

async function migrateArrayField(db, writer, colName, field, oldValue, newValue, execute) {
  let updated = 0;
  let lastDoc = null;
  const FieldPath = admin.firestore.FieldPath;
  console.log(`\n[${colName}] ${field} array-contains ${oldValue}`);
  while (true) {
    let q = db.collection(colName).where(field, "array-contains", oldValue).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const { next, changed } = replaceArray(data[field], oldValue, newValue);
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

async function migrateStringField(db, writer, colName, field, oldValue, newValue, execute) {
  let updated = 0;
  let lastDoc = null;
  const FieldPath = admin.firestore.FieldPath;
  console.log(`\n[${colName}] ${field} == ${oldValue}`);
  while (true) {
    let q = db.collection(colName).where(field, "==", oldValue).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      updated += 1;
      if (execute) {
        writer.update(doc.ref, { [field]: newValue });
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

  console.log(`Migracion ${execute ? "EJECUTAR" : "DRY-RUN"}: ${OLD_PERM} -> ${NEW_PERM}`);

  const stats = [];

  stats.push(["usuarios_access.permissions", await migrateArrayField(db, writer, "usuarios_access", "permissions", OLD_PERM, NEW_PERM, execute)]);
  stats.push(["roles.permissions", await migrateArrayField(db, writer, "roles", "permissions", OLD_PERM, NEW_PERM, execute)]);
  stats.push(["roles.permisos", await migrateArrayField(db, writer, "roles", "permisos", OLD_PERM, NEW_PERM, execute)]);

  stats.push(["movimientos_inventario.tipo", await migrateStringField(db, writer, "movimientos_inventario", "tipo", OLD_TIPO, NEW_TIPO, execute)]);

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
