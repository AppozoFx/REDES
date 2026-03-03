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

  autoKey?: string;
  autoType?: "BIRTHDAY";

  audit?: any; // contiene Timestamps
};

type BirthdayUser = {
  uid: string;
  nombre: string;
};

type ComunicadoPersistencia = "ONCE" | "ALWAYS";

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

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdOfDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dmyOfDate(d: Date) {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function birthdayAutoKey(d: Date) {
  return `BIRTHDAY:${ymdOfDate(d)}`;
}

function formatBirthdayBody(users: BirthdayUser[]) {
  const names = users.map((u) => u.nombre).filter(Boolean);
  if (!names.length) {
    return "Hoy celebramos los cumpleaños del equipo. Les deseamos un gran día.";
  }
  if (names.length === 1) {
    return `Hoy celebramos el cumpleaños de ${names[0]}. Le deseamos un gran día.`;
  }
  if (names.length === 2) {
    return `Hoy celebramos los cumpleaños de ${names[0]} y ${names[1]}. Les deseamos un gran día.`;
  }
  const head = names.slice(0, -1).join(", ");
  const tail = names[names.length - 1];
  return `Hoy celebramos los cumpleaños de ${head} y ${tail}. Les deseamos un gran día.`;
}

function asPersistencia(v: any): ComunicadoPersistencia {
  return String(v ?? "").toUpperCase() === "ONCE" ? "ONCE" : "ALWAYS";
}

function asStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function monthDayInTimeZone(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { month, day };
}

async function listBirthdayUsersForDate(d: Date): Promise<BirthdayUser[]> {
  const tz = "America/Lima";
  const target = monthDayInTimeZone(d, tz);
  const snap = await adminDb().collection("usuarios").limit(5000).get();
  const out: BirthdayUser[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as any;
    if (String(data?.estadoPerfil ?? "ACTIVO").toUpperCase() !== "ACTIVO") continue;
    const birth = toDate(data?.fNacimiento);
    if (!birth) continue;
    const candidate = monthDayInTimeZone(birth, tz);
    if (candidate.month !== target.month || candidate.day !== target.day) continue;

    const nombre = `${String(data?.nombres ?? "").trim()} ${String(data?.apellidos ?? "").trim()}`.trim();
    out.push({ uid: doc.id, nombre: nombre || doc.id });
  }

  out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  return out;
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

export async function syncBirthdayComunicadoForDate(date: Date, actorUid: string) {
  const db = adminDb();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const autoKey = birthdayAutoKey(date);
  const birthdays = await listBirthdayUsersForDate(date);

  const existingSnap = await db
    .collection("comunicados")
    .where("autoKey", "==", autoKey)
    .limit(1)
    .get();

  const now = new Date();
  const localDateLabel = dmyOfDate(date);
  const titulo = birthdays.length
    ? `Cumpleaños del día (${localDateLabel})`
    : `Cumpleaños del día (${localDateLabel}) - sin registros`;
  const cuerpo = formatBirthdayBody(birthdays);

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    const cur = (doc.data() ?? {}) as any;
    const persistencia = asPersistencia(cur?.persistencia);
    const obligatorio = typeof cur?.obligatorio === "boolean" ? cur.obligatorio : false;
    const prioridad = typeof cur?.prioridad === "number" ? cur.prioridad : 10;
    const keepUsers = asStringArray(cur?.uidsTarget);

    const patch = {
      titulo,
      cuerpo,
      estado: "ACTIVO" as const,
      target: "ALL" as const,
      rolesTarget: [],
      areasTarget: [],
      uidsTarget: keepUsers,
      persistencia,
      obligatorio,
      prioridad,
      visibleDesde: from,
      visibleHasta: to,
      autoType: "BIRTHDAY" as const,
      autoKey,
      audit: { updatedAt: now, updatedBy: actorUid },
    };

    const ref = doc.ref;
    await ref.set(patch, { merge: true });
    return { id: ref.id, created: false, count: birthdays.length };
  }

  const ref = db.collection("comunicados").doc();
  const patch = {
    titulo,
    cuerpo,
    estado: "ACTIVO" as const,
    target: "ALL" as const,
    rolesTarget: [],
    areasTarget: [],
    uidsTarget: [],
    persistencia: "ALWAYS" as const,
    obligatorio: false,
    prioridad: 10,
    visibleDesde: from,
    visibleHasta: to,
    autoType: "BIRTHDAY" as const,
    autoKey,
  };
  await ref.set({
    ...patch,
    audit: {
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      updatedBy: actorUid,
    },
  });
  return { id: ref.id, created: true, count: birthdays.length };
}

export async function syncBirthdayComunicadoToday(actorUid: string) {
  return syncBirthdayComunicadoForDate(new Date(), actorUid);
}
