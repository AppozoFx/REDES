import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { BigQuery } from "@google-cloud/bigquery";
import * as logger from "firebase-functions/logger";

const PROJECT = "redes-5bb81";
const DATASET = "ordenes_export";
const TABLE = "garantias_proveedor_rows";

type BqRow = {
  inst_ym: string;
  import_id: string;
  win_id: string;
  cod_pedido: string;
  nombre: string;
  fecha_instalacion_ymd: string;
  fecha_atencion_ymd: string;
  dias_desde_instalacion: number | null;
  cuadrilla: string;
  tipo_cierre: string;
  solucionado: string;
  partner: string;
  sincronizado_at: string;
};

async function deleteRowsForPeriod(bq: BigQuery, instYm: string) {
  await bq.query({
    query: `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE inst_ym = @instYm`,
    params: { instYm },
  });
}

export const garantiasCruceSync = onDocumentWritten(
  {
    region: "southamerica-west1",
    document: "garantias_cruce_periods/{instYm}",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const instYm = event.params.instYm;
    const bq = new BigQuery({ projectId: PROJECT });

    if (!event.data?.after?.exists) {
      logger.info(`garantiasCruceSync: período ${instYm} eliminado → limpiando BQ`);
      await deleteRowsForPeriod(bq, instYm);
      return;
    }

    const periodData = (event.data.after.data() ?? {}) as Record<string, unknown>;
    const importId = String(periodData.importId ?? "");
    const sincronizadoAt = new Date().toISOString();

    logger.info(`garantiasCruceSync: sincronizando período ${instYm} (importId=${importId})`);

    const db = getFirestore();
    const rowsSnap = await db
      .collection("garantias_cruce_periods")
      .doc(instYm)
      .collection("rows")
      .get();

    await deleteRowsForPeriod(bq, instYm);

    if (rowsSnap.empty) {
      logger.info(`garantiasCruceSync: sin filas para ${instYm}`);
      return;
    }

    const rows: BqRow[] = rowsSnap.docs.map((doc) => {
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
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await bqTable.insert(rows.slice(i, i + BATCH_SIZE));
    }

    logger.info(`garantiasCruceSync: ${rows.length} filas insertadas para ${instYm}`);
  }
);
