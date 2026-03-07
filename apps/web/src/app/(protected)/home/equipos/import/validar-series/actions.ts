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

type ProIdPair = { sn: string; proId: string };

type SaveRowStatus = "updated" | "already_same" | "has_existing_proid" | "not_found" | "not_ont" | "invalid";

type SaveRow = {
  sn: string;
  proId: string;
  ok: boolean;
  status: SaveRowStatus;
  previousProId: string;
  message: string;
};

async function procesarParesProId(input: {
  pairs: ProIdPair[];
  forceReplace: boolean;
  sessionLabel: string;
  actorUid: string;
  maxPairs: number;
  logType: string;
}) {
  const db = adminDb();
  const { forceReplace, sessionLabel, actorUid, maxPairs, logType } = input;
  const pairs = Array.isArray(input.pairs) ? input.pairs : [];

  if (!pairs.length) throw new Error("PAIRS_REQUIRED");
  if (pairs.length > maxPairs) throw new Error(`MAX_${maxPairs}_PAIRS`);

  const normalized = pairs.map((p) => ({
    sn: normalizeSn(p?.sn),
    proId: normalizeProId(p?.proId),
  }));
  if (normalized.some((p) => !p.sn)) throw new Error("SN_REQUIRED");
  if (normalized.some((p) => !p.proId)) throw new Error("PROID_REQUIRED");

  const seenSn = new Set<string>();
  for (const p of normalized) {
    if (seenSn.has(p.sn)) throw new Error(`DUPLICATE_SN_IN_BATCH:${p.sn}`);
    seenSn.add(p.sn);
  }

  const resultRows: SaveRow[] = [];

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
            updatedBy: actorUid,
          },
        },
        { merge: true }
      );

      const logRef = db.collection(LOGS_COL).doc();
      tx.set(logRef, {
        type: logType,
        sn: row.sn,
        proIdNew: row.proId,
        proIdPrev: previousProId || null,
        forceReplace,
        sessionLabel: sessionLabel || null,
        actorUid,
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
  return procesarParesProId({
    pairs: Array.isArray(input?.pairs) ? input.pairs : [],
    forceReplace: !!input?.forceReplace,
    sessionLabel: String(input?.sessionLabel || "").trim(),
    actorUid: session.uid,
    maxPairs: 20,
    logType: "ONT_PROID_LINK",
  });
}

export async function guardarProIdMasivoDesdeSnAction(input: {
  sns: string[];
  forceReplace?: boolean;
  sessionLabel?: string;
}) {
  const session = await requireServerPermission(PERM);
  const sns = Array.isArray(input?.sns) ? input.sns.map((v) => normalizeSn(v)).filter(Boolean) : [];

  return procesarParesProId({
    pairs: sns.map((sn) => ({ sn, proId: sn })),
    forceReplace: !!input?.forceReplace,
    sessionLabel: String(input?.sessionLabel || "").trim(),
    actorUid: session.uid,
    maxPairs: 1000,
    logType: "ONT_PROID_LINK_BULK_SN_EQ_PROID",
  });
}
