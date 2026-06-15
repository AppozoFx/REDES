/**
 * Backfill de 7 instalaciones de abril 2026 faltantes en BigQuery.
 *
 * Problema: el export BQ empezó el 18-may-2026. Documentos de Firestore
 * finalizados antes de esa fecha y sin modificaciones posteriores no están en BQ.
 *
 * Solución: comparar BQ vs Firestore para el período, identificar los faltantes
 * y "tocarlos" (actualizar un campo inocuo) para que la extensión BQ los capture.
 *
 * Uso:
 *   cd C:\Proyectos\REDES\firebase\functions
 *   npx ts-node --project tsconfig.json ..\scripts\backfill_instalaciones_abril_bq.ts
 *
 * Requiere GOOGLE_APPLICATION_CREDENTIALS o estar autenticado con `firebase login`.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { BigQuery } from "@google-cloud/bigquery";

const PROJECT = "redes-5bb81";
const INST_YM = "2026-04"; // Período a corregir
const INST_FROM = "2026-04-01";
const INST_TO = "2026-04-30";

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const bq = new BigQuery({ projectId: PROJECT });

async function getDocIdsInBq(): Promise<Set<string>> {
  const [rows] = await bq.query({
    query: `
      SELECT DISTINCT document_id
      FROM \`${PROJECT}.ordenes_export.ordenes_raw_changelog\`
      WHERE JSON_VALUE(data, '$.fSoliYmd') >= @from
        AND JSON_VALUE(data, '$.fSoliYmd') <= @to
        AND JSON_VALUE(data, '$.estado') = 'Finalizada'
        AND JSON_VALUE(data, '$.tipoTraba') IN ('INSTALACION', 'INSTALACION POSIBLE FRAUDE')
    `,
    params: { from: INST_FROM, to: INST_TO },
  });
  const ids = new Set<string>();
  for (const row of rows as any[]) ids.add(String(row.document_id));
  console.log(`BQ: ${ids.size} document_ids para ${INST_YM}`);
  return ids;
}

async function getDocIdsInFirestore(): Promise<Map<string, FirebaseFirestore.DocumentReference>> {
  const map = new Map<string, FirebaseFirestore.DocumentReference>();
  let processed = 0;
  let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;

  while (true) {
    let query = db.collection("ordenes")
      .where("fSoliYmd", ">=", INST_FROM)
      .where("fSoliYmd", "<=", INST_TO)
      .select("tipoTraba", "fSoliYmd", "estado")
      .limit(500);

    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const tipoTraba = String(doc.data().tipoTraba || "");
      const estado = String(doc.data().estado || "");
      if (
        estado === "Finalizada" &&
        (tipoTraba === "INSTALACION" || tipoTraba === "INSTALACION POSIBLE FRAUDE")
      ) {
        map.set(doc.id, doc.ref);
        processed++;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`  Firestore leído: ${processed} instalaciones...\r`);

    if (snap.size < 500) break;
  }

  console.log(`\nFirestore: ${map.size} instalaciones finalizadas para ${INST_YM}`);
  return map;
}

async function main() {
  console.log(`\n=== Backfill instalaciones ${INST_YM} ===\n`);

  const [bqIds, firestoreMap] = await Promise.all([
    getDocIdsInBq(),
    getDocIdsInFirestore(),
  ]);

  const faltantes: FirebaseFirestore.DocumentReference[] = [];
  for (const [docId, ref] of firestoreMap.entries()) {
    if (!bqIds.has(docId)) faltantes.push(ref);
  }

  console.log(`\nFaltantes en BQ: ${faltantes.length} documentos`);

  if (faltantes.length === 0) {
    console.log("✓ BQ y Firestore están sincronizados. Sin acción necesaria.");
    return;
  }

  for (const ref of faltantes) {
    console.log(`  Tocando: ${ref.id}`);
  }

  const BATCH_SIZE = 450;
  for (let i = 0; i < faltantes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const ref of faltantes.slice(i, i + BATCH_SIZE)) {
      // Campo inocuo — solo dispara el trigger del BQ export extension
      batch.update(ref, { _bqSyncAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }

  console.log(`\n✓ ${faltantes.length} documentos actualizados en Firestore.`);
  console.log("  La extensión BigQuery Export los capturará en ~1 minuto.");
  console.log("  Después refresca el dataset en Power BI (Actualizar ahora).");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
