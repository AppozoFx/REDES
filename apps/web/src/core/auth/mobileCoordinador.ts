import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { getMobileProfile } from "./mobile";
import type { MobileAuthContext } from "./mobile";

export type CoordinadorContext = {
  uid: string;
  coordinadorNombre: string;
  cuadrillasIds: string[];
  cuadrillas: Array<{ id: string; nombre: string; categoria: string }>;
};

export async function getCoordinadorContext(mobile: MobileAuthContext): Promise<CoordinadorContext> {
  const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
  if (!roles.includes("COORDINADOR") && !roles.includes("ADMIN")) {
    throw new Error("ROLE_COORDINADOR_REQUIRED");
  }

  const cuadrillasSnap = await adminDb()
    .collection("cuadrillas")
    .where("coordinadorUid", "==", mobile.uid)
    .where("estado", "==", "HABILITADO")
    .get();

  const cuadrillas = cuadrillasSnap.docs.map((d) => {
    const x = d.data() as any;
    return { id: d.id, nombre: String(x.nombre || d.id), categoria: String(x.categoria || "") };
  });

  const profileSnap = await adminDb().collection("usuarios").doc(mobile.uid).get();
  const profileData = profileSnap.exists ? (profileSnap.data() as any) : {};
  const coordinadorNombre = `${String(profileData?.nombres || "").trim()} ${String(profileData?.apellidos || "").trim()}`.trim() || mobile.uid;

  return {
    uid: mobile.uid,
    coordinadorNombre,
    cuadrillasIds: cuadrillas.map((c) => c.id),
    cuadrillas,
  };
}

export async function sustainCoordinadorEquipo(
  mobile: MobileAuthContext,
  cuadrillaId: string,
  sn: string,
  file: File,
) {
  const coord = await getCoordinadorContext(mobile);
  const cleanCuadrillaId = String(cuadrillaId || "").trim();
  const cleanSn = String(sn || "").trim().toUpperCase();

  if (!coord.cuadrillasIds.includes(cleanCuadrillaId)) throw new Error("CUADRILLA_NOT_FOUND");
  if (!cleanSn) throw new Error("SN_REQUIRED");
  if (!(file instanceof File)) throw new Error("FILE_REQUIRED");

  const db = adminDb();
  const equipmentRef = db.collection("equipos").doc(cleanSn);
  const equipmentSnap = await equipmentRef.get();
  if (!equipmentSnap.exists) throw new Error("NOT_FOUND");

  const mimeType = String(file.type || "").trim().toLowerCase();
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `auditoria/${cleanSn}.${ext}`;
  const bucket = adminStorageBucket();
  const token = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  await bucket.file(path).save(buffer, {
    contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
    metadata: { metadata: { firebaseStorageDownloadTokens: token, uploadedBy: mobile.uid, uploadedForCuadrilla: cleanCuadrillaId } },
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  const profile = await getMobileProfile(mobile.uid);
  const prev = (equipmentSnap.data() || {}) as any;

  await equipmentRef.set({
    auditoria: {
      ...(prev?.auditoria || {}),
      requiere: true,
      estado: "sustentada",
      fotoPath: path,
      fotoURL: url,
      actualizadoEn: FieldValue.serverTimestamp(),
      actualizadoPor: mobile.uid,
      marcadoPor: mobile.uid,
      marcadoPorNombre: profile.nombreCorto || profile.nombre || mobile.uid,
    },
  }, { merge: true });

  const updatedSnap = await equipmentRef.get();
  const updatedEquipo = updatedSnap.data() || {};
  const seriesSnap = await db.collection("cuadrillas").doc(cleanCuadrillaId).collection("equipos_series").doc(cleanSn).get();
  const series = seriesSnap.data() || {};

  return {
    sn: cleanSn,
    tipo: String((updatedEquipo as any)?.equipo || (series as any)?.equipo || "").trim(),
    estado: "sustentada",
    fotoURL: url,
  };
}
