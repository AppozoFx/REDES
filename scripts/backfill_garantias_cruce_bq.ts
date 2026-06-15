/**
 * Backfill de garantias_proveedor_rows en BigQuery
 * Sincroniza todos los períodos existentes en Firestore hacia BigQuery.
 *
 * Uso (desde la raíz del monorepo):
 *   npx ts-node --project apps/web/tsconfig.json scripts/backfill_garantias_cruce_bq.ts
 *
 * Requiere:
 *   - GOOGLE_APPLICATION_CREDENTIALS apuntando al service account con acceso a BQ
 *   - Variables de entorno Firebase Admin configuradas
 */

import { BigQuery } from "@google-cloud/bigquery";
import * as admin from "firebase-admin";

const PROJECT = "redes-5bb81";
const DATASET = "ordenes_export";
const TABLE = "garantias_proveedor_rows";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function deleteRowsForPeriod(bq: BigQuery, instYm: string) {
  await bq.query({
    query: `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE inst_ym = @instYm`,
    params: { instYm },
  });
}

async function main() {
  const bq = new BigQuery({ projectId: PROJECT });

  const periodsSnap = await db.collection("garantias_cruce_periods").orderBy("instYm", "asc").get();
  if (periodsSnap.empty) {
    console.log("Sin períodos en Firestore.");
    return;
  }

  for (const periodDoc of periodsSnap.docs) {
    const instYm = periodDoc.id;
    const periodData = periodDoc.data() as Record<string, any>;
    const importId = String(periodData.importId ?? "");
    const sincronizadoAt = new Date().toISOString();

    console.log(`\n[${instYm}] Leyendo filas desde Firestore...`);
    const rowsSnap = await db
      .collection("garantias_cruce_periods")
      .doc(instYm)
      .collection("rows")
      .get();

    console.log(`[${instYm}] ${rowsSnap.size} filas encontradas. Limpiando BQ...`);
    await deleteRowsForPeriod(bq, instYm);

    if (rowsSnap.empty) {
      console.log(`[${instYm}] Sin filas — período vacío, omitido.`);
      continue;
    }

    const rows = rowsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        inst_ym: instYm,
        import_id: importId,
        win_id: String(d.id ?? ""),
        cod_pedido: String(d.codPedido ?? ""),
        nombre: String(d.nombre ?? ""),
        fecha_instalacion_ymd: String(d.fechaInstalacionYmd ?? ""),
        fecha_atencion_ymd: String(d.fechaAtencionYmd ?? ""),
        dias_desde_instalacion: typeof d.diasDesdeInstalacion === "number" ? d.diasDesdeInstalacion : null,
        cuadrilla: String(d.cuadrilla ?? ""),
        tipo_cierre: String(d.tipoCierre ?? ""),
        solucionado: String(d.solucionado ?? ""),
        partner: String(d.partner ?? ""),
        sincronizado_at: sincronizadoAt,
      };
    });

    const bqTable = bq.dataset(DATASET).table(TABLE);
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await bqTable.insert(rows.slice(i, i + BATCH));
      process.stdout.write(`  → insertados ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
    }
    console.log(`[${instYm}] ✓ ${rows.length} filas sincronizadas.`);
  }

  console.log("\nBackfill completado.");
}

main().catch((err) => {
  console.error("Error en backfill:", err);
  process.exit(1);
});
