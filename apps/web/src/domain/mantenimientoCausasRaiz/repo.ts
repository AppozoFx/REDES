import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const COL = "mantenimiento_causas_raiz";
const LIQ_COL = "mantenimiento_liquidaciones";

function col() {
  return adminDb().collection(COL);
}

function norm(v: unknown) {
  return String(v || "").trim();
}

function toId(nombre: string) {
  return norm(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "_");
}

async function countUsageByNombre(nombre: string) {
  const clean = norm(nombre);
  if (!clean) return 0;
  const snap = await adminDb().collection(LIQ_COL).where("causaRaiz", "==", clean).limit(1).get();
  return snap.size;
}

export async function listMantenimientoCausasRaiz() {
  const snap = await col().orderBy("nombre", "asc").limit(300).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createMantenimientoCausaRaiz(nombre: string, actorUid: string) {
  const clean = norm(nombre);
  if (!clean) throw new Error("NOMBRE_REQUIRED");
  const id = toId(clean);
  if (!id) throw new Error("NOMBRE_REQUIRED");
  const ref = col().doc(id);
  const snap = await ref.get();
  if (snap.exists) throw new Error("CAUSA_DUPLICADA");
  await ref.set({
    nombre: clean,
    estado: "ACTIVO",
    audit: {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    },
  });
  return { id };
}

export async function updateMantenimientoCausaRaiz(id: string, nombre: string, actorUid: string) {
  const clean = norm(nombre);
  if (!clean) throw new Error("NOMBRE_REQUIRED");
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const curr = snap.data() as any;
  const prevNombre = norm(curr?.nombre);
  if (prevNombre && prevNombre !== clean) {
    const used = await countUsageByNombre(prevNombre);
    if (used > 0) throw new Error("CAUSA_EN_USO");
  }
  await ref.set(
    {
      nombre: clean,
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
}

export async function deleteMantenimientoCausaRaiz(id: string) {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const curr = snap.data() as any;
  const used = await countUsageByNombre(curr?.nombre);
  if (used > 0) throw new Error("CAUSA_EN_USO");
  await ref.delete();
}
