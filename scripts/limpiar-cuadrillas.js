/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required");
  let obj;
  try { obj = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalid JSON"); }
  const projectId = obj.project_id || obj.projectId;
  let privateKey = obj.private_key || obj.privateKey;
  const clientEmail = obj.client_email || obj.clientEmail;
  if (typeof privateKey === "string") privateKey = privateKey.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
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

async function deleteSubcollection(db, baseRef, subName, dryRun) {
  let deleted = 0;
  let last = null;
  const pageSize = 500;
  while (true) {
    let q = baseRef.collection(subName).orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    if (!dryRun) {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    deleted += snap.size;
    last = snap.docs[snap.docs.length - 1];
  }
  return deleted;
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const subs = ["bobinas", "equipos_series", "equipos_stock", "stock"];

  let cuadrillasCount = 0;
  const totals = Object.fromEntries(subs.map((s) => [s, 0]));

  console.log(dryRun ? "Dry run: no se borrara nada." : "Borrado real: se eliminaran documentos.");

  let last = null;
  const pageSize = 200;
  while (true) {
    let q = db.collection("cuadrillas").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      cuadrillasCount++;
      for (const sub of subs) {
        const n = await deleteSubcollection(db, doc.ref, sub, dryRun);
        totals[sub] += n;
      }
    }
    last = snap.docs[snap.docs.length - 1];
    console.log(`Cuadrillas procesadas: ${cuadrillasCount}`);
  }

  console.log("Resumen:");
  console.log(`- Cuadrillas: ${cuadrillasCount}`);
  subs.forEach((s) => console.log(`- ${s}: ${totals[s]}`));
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
