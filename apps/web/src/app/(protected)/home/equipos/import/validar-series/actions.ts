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
  if (pairs.length > 200) throw new Error("MAX_200_PAIRS");

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
    const ref = db.collection("equipos").doc(row.sn);
    const snap = await ref.get();
    if (!snap.exists) {
      resultRows.push({
        sn: row.sn,
        proId: row.proId,
        ok: false,
        status: "not_found",
        previousProId: "",
        message: "SN no existe en EQUIPOS",
      });
      continue;
    }

    const data = snap.data() as any;
    const equipo = String(data?.equipo || "").trim().toUpperCase();
    const previousProId = String(data?.proId || "").trim().toUpperCase();
    if (equipo !== "ONT") {
      resultRows.push({
        sn: row.sn,
        proId: row.proId,
        ok: false,
        status: "not_ont",
        previousProId,
        message: `SN existe pero equipo=${equipo || "N/A"} (no ONT)`,
      });
      continue;
    }

    if (previousProId && previousProId === row.proId) {
      resultRows.push({
        sn: row.sn,
        proId: row.proId,
        ok: true,
        status: "already_same",
        previousProId,
        message: "ProID ya estaba asignado con el mismo valor",
      });
      continue;
    }

    if (previousProId && previousProId !== row.proId && !forceReplace) {
      resultRows.push({
        sn: row.sn,
        proId: row.proId,
        ok: false,
        status: "has_existing_proid",
        previousProId,
        message: `Ya tiene ProID (${previousProId}). Activa reemplazo forzado para actualizar`,
      });
      continue;
    }

    await ref.set(
      {
        proId: row.proId,
        audit: {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

    resultRows.push({
      sn: row.sn,
      proId: row.proId,
      ok: true,
      status: "updated",
      previousProId,
      message: previousProId ? `ProID reemplazado (${previousProId} -> ${row.proId})` : "ProID asignado",
    });

    await db.collection(LOGS_COL).add({
      type: "ONT_PROID_LINK",
      sn: row.sn,
      proIdNew: row.proId,
      proIdPrev: previousProId || null,
      forceReplace,
      sessionLabel: sessionLabel || null,
      actorUid: session.uid,
      ts: new Date().toISOString(),
    });
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

