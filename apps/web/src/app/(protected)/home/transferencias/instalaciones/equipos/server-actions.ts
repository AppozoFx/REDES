"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerPermission } from "@/core/auth/require";
import { normalizeUbicacion } from "@/domain/equipos/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

async function getUsuarioDisplayName(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  if (!snap.exists) return uid;
  const data = snap.data() as any;
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const parts = `${nombres} ${apellidos}`.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return uid;
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
}

function updateEquiposStockTx(
  tx: FirebaseFirestore.Transaction,
  opts: { cuadrillaId: string; tipo: string; delta: number }
) {
  const db = adminDb();
  const tipo = String(opts.tipo || "UNKNOWN").toUpperCase();
  const ref = db.collection("cuadrillas").doc(opts.cuadrillaId).collection("equipos_stock").doc(tipo);
  tx.set(
    ref,
    {
      tipo,
      cantidad: FieldValue.increment(opts.delta),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function moverEquipoManualAction(input: {
  sn: string;
  toUbicacion: string;
  fromCuadrillaId?: string;
  toCuadrillaId?: string;
}) {
  const session = await requireServerPermission("EQUIPOS_EDIT");
  const db = adminDb();
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = db.collection("equipos").doc(sn);
  let prevUb = "";
  let nextUb = "";
  let nextEstado = "";
  let tipoEq = "UNKNOWN";
  let descripcion = "";

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("EQUIPO_NOT_FOUND");
    const e = snap.data() as any;

    prevUb = normalizeUbicacion(String(e.ubicacion || "")).ubicacion;
    const nextNorm = normalizeUbicacion(String(input.toUbicacion || ""));
    nextUb = nextNorm.ubicacion;
    nextEstado = nextNorm.isCuadrilla ? "CAMPO" : nextNorm.ubicacion === "ALMACEN" ? "ALMACEN" : nextNorm.estado;
    tipoEq = String(e.equipo || "UNKNOWN").toUpperCase();
    descripcion = String(e.descripcion || "");

    if (prevUb === nextUb) return;

    tx.update(ref, {
      ubicacion: nextUb,
      estado: nextEstado,
      audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() },
    });

    if (input.fromCuadrillaId) {
      updateEquiposStockTx(tx, { cuadrillaId: input.fromCuadrillaId, tipo: tipoEq, delta: -1 });
      const seriesRef = db.collection("cuadrillas").doc(input.fromCuadrillaId).collection("equipos_series").doc(sn);
      tx.delete(seriesRef);
    }
    if (input.toCuadrillaId) {
      updateEquiposStockTx(tx, { cuadrillaId: input.toCuadrillaId, tipo: tipoEq, delta: 1 });
      const seriesRef = db.collection("cuadrillas").doc(input.toCuadrillaId).collection("equipos_series").doc(sn);
      tx.set(
        seriesRef,
        {
          SN: sn,
          equipo: tipoEq,
          descripcion,
          ubicacion: nextUb,
          estado: nextEstado,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  try {
    const usuario = await getUsuarioDisplayName(session.uid);
    const msg = `${usuario} movió ${tipoEq} (SN: ${sn}) de "${prevUb}" a "${nextUb}"`;
    await addGlobalNotification({
      title: "Movimiento de Equipo",
      message: msg,
      type: "info",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "EQUIPO_MOVE",
      entityId: sn,
      action: "UPDATE",
      estado: "ACTIVO",
    });
  } catch {}

  return { ok: true, sn, ubicacion: nextUb, estado: nextEstado };
}

export async function marcarAuditoriaAction(input: { sn: string }) {
  const session = await requireServerPermission("EQUIPOS_EDIT");
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = adminDb().collection("equipos").doc(sn);
  const fotoPath = `auditoria/${sn}.jpg`;
  await ref.set(
    {
      auditoria: {
        requiere: true,
        estado: "pendiente",
        fotoPath,
        fotoURL: "",
        marcadoPor: session.uid,
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  return {
    ok: true,
    sn,
    auditoria: {
      requiere: true,
      estado: "pendiente",
      fotoPath,
      fotoURL: "",
      marcadoPor: session.uid,
    },
  };
}

export async function quitarAuditoriaAction(input: { sn: string }) {
  await requireServerPermission("EQUIPOS_EDIT");
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = adminDb().collection("equipos").doc(sn);
  await ref.update({ auditoria: FieldValue.delete() });

  return { ok: true, sn };
}
