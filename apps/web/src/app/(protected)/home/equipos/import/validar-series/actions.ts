"use server";

import { FieldValue } from "firebase-admin/firestore";
import { requireServerPermission } from "@/core/auth/require";
import { adminDb } from "@/lib/firebase/admin";

const PERM = "EQUIPOS_IMPORT";
const LOGS_COL = "equipos_validacion_series_logs";

function normalizeSn(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

function normalizeProId(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

export async function validarSerieAction(input: { sn: string }) {
  await requireServerPermission(PERM);
  const sn = normalizeSn(input?.sn);
  if (!sn) throw new Error("SN_REQUIRED");

  const snap = await adminDb().collection("equipos").doc(sn).get();
  if (!snap.exists) {
    return {
      ok: true,
      sn,
      exists: false,
      isOnt: false,
      equipo: "",
      descripcion: "",
      ubicacion: "",
      estado: "",
      proId: "",
    };
  }

  const d = snap.data() as any;
  const equipo = String(d?.equipo || "").trim().toUpperCase();
  return {
    ok: true,
    sn,
    exists: true,
    isOnt: equipo === "ONT",
    equipo,
    descripcion: String(d?.descripcion || ""),
    ubicacion: String(d?.ubicacion || ""),
    estado: String(d?.estado || ""),
    proId: String(d?.proId || ""),
  };
}

export async function guardarProIdLoteAction(input: {
  pairs: Array<{ sn: string; proId: string }>;
  forceReplace?: boolean;
  sessionLabel?: string;
}) {
  const session = await requireServerPermission(PERM);
  const db = adminDb();
  const forceReplace = !!input?.forceReplace;
  const sessionLabel = String(input?.sessionLabel || "").trim();
  const pairs = Array.isArray(input?.pairs) ? input.pairs : [];

  if (!pairs.length) throw new Error("PAIRS_REQUIRED");
  if (pairs.length > 20) throw new Error("MAX_20_PAIRS");

  const normalized = pairs.map((p) => ({
    sn: normalizeSn(p?.sn),
    proId: normalizeProId(p?.proId),
  }));
  if (normalized.some((p) => !p.sn)) throw new Error("SN_REQUIRED");
  if (normalized.some((p) => !p.proId)) throw new Error("PROID_REQUIRED");

  const resultRows: Array<{
    sn: string;
    proId: string;
    ok: boolean;
    status: "updated" | "already_same" | "has_existing_proid" | "not_found" | "not_ont" | "invalid";
    previousProId: string;
    message: string;
  }> = [];

  for (const row of normalized) {
    const res = await db.runTransaction(async (tx) => {
      const ref = db.collection("equipos").doc(row.sn);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return {
          sn: row.sn,
          proId: row.proId,
          ok: false,
          status: "not_found" as const,
          previousProId: "",
          message: "SN no existe en EQUIPOS",
        };
      }

      const data = snap.data() as any;
      const equipo = String(data?.equipo || "").trim().toUpperCase();
      const previousProId = String(data?.proId || "").trim().toUpperCase();
      if (equipo !== "ONT") {
        return {
          sn: row.sn,
          proId: row.proId,
          ok: false,
          status: "not_ont" as const,
          previousProId,
          message: `SN existe pero equipo=${equipo || "N/A"} (no ONT)`,
        };
      }

      if (previousProId && previousProId === row.proId) {
        return {
          sn: row.sn,
          proId: row.proId,
          ok: true,
          status: "already_same" as const,
          previousProId,
          message: "ProID ya estaba asignado con el mismo valor",
        };
      }

      if (previousProId && previousProId !== row.proId && !forceReplace) {
        return {
          sn: row.sn,
          proId: row.proId,
          ok: false,
          status: "has_existing_proid" as const,
          previousProId,
          message: `Ya tiene ProID (${previousProId}). Activa reemplazo forzado para actualizar`,
        };
      }

      tx.set(
        ref,
        {
          proId: row.proId,
          audit: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        },
        { merge: true }
      );

      const logRef = db.collection(LOGS_COL).doc();
      tx.set(logRef, {
        type: "ONT_PROID_LINK",
        sn: row.sn,
        proIdNew: row.proId,
        proIdPrev: previousProId || null,
        forceReplace,
        sessionLabel: sessionLabel || null,
        actorUid: session.uid,
        ts: FieldValue.serverTimestamp(),
      });

      return {
        sn: row.sn,
        proId: row.proId,
        ok: true,
        status: "updated" as const,
        previousProId,
        message: previousProId ? `ProID reemplazado (${previousProId} -> ${row.proId})` : "ProID asignado",
      };
    });

    resultRows.push(res);
  }

  const summary = resultRows.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.status === "updated") acc.updated += 1;
      if (r.status === "already_same") acc.alreadySame += 1;
      if (r.status === "has_existing_proid") acc.hasExisting += 1;
      if (r.status === "not_found") acc.notFound += 1;
      if (r.status === "not_ont") acc.notOnt += 1;
      return acc;
    },
    { total: 0, updated: 0, alreadySame: 0, hasExisting: 0, notFound: 0, notOnt: 0 }
  );

  return {
    ok: true,
    summary,
    rows: resultRows,
  };
}
