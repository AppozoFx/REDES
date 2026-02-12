import { adminDb } from "@/lib/firebase/admin";

export type ComunicadoDoc = {
  id: string;
  titulo: string;
  cuerpo: string;
  estado: "ACTIVO" | "INACTIVO";
  target: "ALL" | "ROLES" | "AREAS" | "USERS";
  rolesTarget: string[];
  areasTarget: string[];
  uidsTarget: string[];
  prioridad: number;
  obligatorio: boolean;

  persistencia?: "ONCE" | "ALWAYS";

  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;

  visibleDesde?: any; // Firestore Timestamp
  visibleHasta?: any; // Firestore Timestamp

  audit?: any; // contiene Timestamps
};

function parseYmd(ymd: any): { y: number; m: number; d: number } | null {
  const s = String(ymd ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function ymdToLocalStartOfDay(ymd: any): Date | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0);
}

function ymdToLocalEndOfDay(ymd: any): Date | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999);
}

export async function listComunicados(limit = 80): Promise<ComunicadoDoc[]> {
  const db = adminDb();

  const snap = await db
    .collection("comunicados")
    .orderBy("audit.createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      ...data,
    } as ComunicadoDoc;
  });
}

export async function getComunicadoById(id: string): Promise<ComunicadoDoc | null> {
  const safeId = String(id ?? "").trim();
  if (!safeId) return null;

  const db = adminDb();
  const doc = await db.collection("comunicados").doc(safeId).get();
  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...(doc.data() as any),
  } as ComunicadoDoc;
}

export async function createComunicado(input: any, actorUid: string): Promise<string> {
  const db = adminDb();
  const now = new Date();

  const ref = db.collection("comunicados").doc();

  const visibleDesde = ymdToLocalStartOfDay(input.visibleDesde);
  const visibleHasta = ymdToLocalEndOfDay(input.visibleHasta);

  await ref.set({
    ...input,

    // ✅ normaliza arrays
    rolesTarget: Array.isArray(input.rolesTarget) ? input.rolesTarget : [],
    areasTarget: Array.isArray(input.areasTarget) ? input.areasTarget : [],
    uidsTarget: Array.isArray(input.uidsTarget) ? input.uidsTarget : [],

    // ✅ estado default
    estado: input.estado ?? "ACTIVO",

    // ✅ persistencia default (por si faltara)
    persistencia: input.persistencia ?? "ONCE",

    // ✅ fechas como Date (Firestore las guarda como Timestamp)
    visibleDesde: visibleDesde ?? null,
    visibleHasta: visibleHasta ?? null,

    audit: {
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      updatedBy: actorUid,
    },
  });

  return ref.id;
}

export async function updateComunicado(id: string, patch: any, actorUid: string) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("Invalid comunicado id");

  const db = adminDb();
  const now = new Date();

  // ✅ si te llega string YYYY-MM-DD, conviértelo; si viene vacío, lo deja en null
  const visibleDesde = ymdToLocalStartOfDay(patch.visibleDesde);
  const visibleHasta = ymdToLocalEndOfDay(patch.visibleHasta);

  const normalizedPatch: any = {
    ...patch,
    audit: { updatedAt: now, updatedBy: actorUid },
  };

  if ("visibleDesde" in patch) normalizedPatch.visibleDesde = visibleDesde ?? null;
  if ("visibleHasta" in patch) normalizedPatch.visibleHasta = visibleHasta ?? null;

  await db.collection("comunicados").doc(safeId).set(normalizedPatch, { merge: true });
}

export async function setComunicadoEstado(
  id: string,
  estado: "ACTIVO" | "INACTIVO",
  actorUid: string
) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("Invalid comunicado id");

  const db = adminDb();
  const now = new Date();

  await db.collection("comunicados").doc(safeId).set(
    {
      estado,
      audit: { updatedAt: now, updatedBy: actorUid },
    },
    { merge: true }
  );
}
