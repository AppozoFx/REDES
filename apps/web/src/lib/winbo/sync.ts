import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { upsertOrden } from "@/domain/ordenes/repo";
import { exportOrdenesXlsx, type WinboManualRequest } from "./client";
import { parseWinboOrdenesExport } from "./exportParser";
import { mapWinboRowsToOrdenImport } from "./mappers";

type SyncMode = "manual" | "auto" | "reconcile";
type SyncScope = "today" | "range";

export type WinboSyncInput = WinboManualRequest & {
  dryRun: boolean;
  mode: SyncMode;
  scope: SyncScope;
};

export type WinboSyncActor = {
  uid: string;
  kind: "user" | "system";
};

export type WinboSyncResult = {
  ok: true;
  source: "WINBO_EXPORT";
  dryRun: boolean;
  request: {
    fechaVisiDesde: string;
    fechaVisiHasta: string;
    filtrosAplicados: Record<string, unknown>;
  };
  export: {
    nombreArchivo: string;
    downloadUrl: string;
  };
  parse: {
    sheetName: string;
    totalRows: number;
    rowsValidas: number;
    rowsOmitidas: number;
    columnasFaltantes: string[];
  };
  resumen: {
    nuevos: number;
    actualizados: number;
    duplicadosSinCambios: number;
    invalidos: number;
  };
  warnings: string[];
  issues: Array<{ rowNumber: number; level: "warning" | "error"; code: string; detail?: string }>;
  auditRunId: string;
};

const LOCK_DOC_PATH = "system_locks/winbo_ordenes_sync";
const LOCK_TTL_MS = 20 * 60 * 1000;

function lockOwnerKey(actor: WinboSyncActor, mode: SyncMode) {
  return `${mode}:${actor.kind}:${actor.uid}`;
}

async function createAuditRun(actor: WinboSyncActor, body: WinboSyncInput) {
  const ref = adminDb().collection("ordenes_import_runs").doc();
  await ref.set({
    source: "WINBO_EXPORT",
    mode: body.mode,
    scope: body.scope,
    dryRun: body.dryRun,
    fechaVisiDesde: body.fechaVisiDesde,
    fechaVisiHasta: body.fechaVisiHasta,
    filtros: body.filtros || {},
    createdBy: actor.uid,
    createdByType: actor.kind,
    status: "RUNNING",
    startedAt: FieldValue.serverTimestamp(),
  });
  return ref;
}

export async function acquireWinboSyncLock(actor: WinboSyncActor, mode: SyncMode) {
  const ref = adminDb().doc(LOCK_DOC_PATH);
  const owner = lockOwnerKey(actor, mode);
  const now = Date.now();
  const expiresAtMs = now + LOCK_TTL_MS;

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as any;
    const currentExpiresAtMs = typeof data?.expiresAtMs === "number" ? Number(data.expiresAtMs) : 0;
    const currentOwner = String(data?.owner || "");
    if (snap.exists && currentExpiresAtMs > now && currentOwner && currentOwner !== owner) {
      throw new Error("IMPORT_IN_PROGRESS");
    }

    tx.set(
      ref,
      {
        owner,
        mode,
        actorUid: actor.uid,
        actorKind: actor.kind,
        lockedAtMs: now,
        expiresAtMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return {
    async release() {
      await ref.set(
        {
          owner: FieldValue.delete(),
          mode: FieldValue.delete(),
          actorUid: FieldValue.delete(),
          actorKind: FieldValue.delete(),
          lockedAtMs: FieldValue.delete(),
          expiresAtMs: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    },
  };
}

export async function syncWinboOrdenes(input: WinboSyncInput, actor: WinboSyncActor): Promise<WinboSyncResult> {
  const auditRef = await createAuditRun(actor, input);
  try {
    const exported = await exportOrdenesXlsx(input);
    const parsed = parseWinboOrdenesExport(exported.fileBuffer);
    const mapped = mapWinboRowsToOrdenImport(parsed.rows);

    let nuevos = 0;
    let actualizados = 0;
    let duplicadosSinCambios = 0;

    if (!input.dryRun) {
      let cursor = 0;
      let workerError: any = null;
      const concurrency = Math.min(12, Math.max(1, mapped.payloads.length));

      async function worker() {
        while (true) {
          if (workerError) return;
          const idx = cursor++;
          if (idx >= mapped.payloads.length) return;
          try {
            const res = await upsertOrden(mapped.payloads[idx], actor.uid);
            if (res === "CREATED") nuevos += 1;
            else if (res === "UPDATED") actualizados += 1;
            else duplicadosSinCambios += 1;
          } catch (error) {
            workerError = error;
            return;
          }
        }
      }

      if (mapped.payloads.length > 0) {
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
      }
      if (workerError) throw workerError;

      await addGlobalNotification({
        title: input.mode === "auto" ? "Sincronizacion automatica WinBo" : "Importacion WinBo",
        message: `nuevos: ${nuevos}, actualizados: ${actualizados}, duplicados: ${duplicadosSinCambios}`,
        type: "success",
        scope: "ALL",
        createdBy: actor.uid,
        entityType: "ORDENES",
        entityId: `winbo-import:${Date.now()}`,
        action: "CREATE",
        estado: "ACTIVO",
      });
    }

    const responseBody: WinboSyncResult = {
      ok: true,
      source: "WINBO_EXPORT",
      dryRun: input.dryRun,
      request: {
        fechaVisiDesde: input.fechaVisiDesde,
        fechaVisiHasta: input.fechaVisiHasta,
        filtrosAplicados: input.filtros || {},
      },
      export: {
        nombreArchivo: exported.nombreArchivo,
        downloadUrl: exported.downloadUrl,
      },
      parse: {
        sheetName: parsed.sheetName,
        totalRows: parsed.totalRows,
        rowsValidas: parsed.rowsValidas,
        rowsOmitidas: parsed.rowsOmitidas,
        columnasFaltantes: parsed.columnasFaltantes,
      },
      resumen: {
        nuevos,
        actualizados,
        duplicadosSinCambios,
        invalidos: mapped.invalidos,
      },
      warnings: [...parsed.warnings, ...mapped.warnings],
      issues: mapped.issues.slice(0, 50),
      auditRunId: auditRef.id,
    };

    await auditRef.set(
      {
        status: "OK",
        finishedAt: FieldValue.serverTimestamp(),
        export: responseBody.export,
        parse: responseBody.parse,
        resumen: responseBody.resumen,
        warnings: responseBody.warnings,
      },
      { merge: true }
    );

    return responseBody;
  } catch (error: any) {
    const message = String(error?.message || "ERROR");
    await auditRef.set(
      {
        status: "ERROR",
        finishedAt: FieldValue.serverTimestamp(),
        error: message,
      },
      { merge: true }
    );
    throw error;
  }
}
