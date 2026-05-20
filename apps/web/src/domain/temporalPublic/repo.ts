import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const COLLECTION = "site_config";
const DOC_ID = "public_temporal_page";

export type TemporalPublicPageData = {
  active: boolean;
  eyebrow: string;
  title: string;
  summary: string;
  primaryTitle: string;
  primaryBody: string;
  secondaryTitle: string;
  secondaryBody: string;
  ctaLabel: string;
  ctaHref: string;
  embedCode: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type FirestoreTemporalPublicPage = Omit<TemporalPublicPageData, "updatedAt"> & {
  updatedAt?: Timestamp | Date | string | null;
};

export const DEFAULT_TEMPORAL_PUBLIC_PAGE: TemporalPublicPageData = {
  active: false,
  eyebrow: "Informacion temporal",
  title: "Contenido temporal REDES",
  summary:
    "Este espacio permite publicar informacion puntual para compartirla mediante un enlace directo, sin exponer ninguna funcionalidad interna del sistema.",
  primaryTitle: "Informacion principal",
  primaryBody:
    "Puedes usar este bloque para publicar avisos, instrucciones, cronogramas o cualquier texto informativo que deba ser visible sin iniciar sesion.",
  secondaryTitle: "Indicaciones adicionales",
  secondaryBody:
    "Cuando la pagina se desactive desde administracion, la ruta publica dejara de mostrarse.",
  ctaLabel: "",
  ctaHref: "",
  embedCode: "",
  updatedAt: null,
  updatedBy: null,
};

function toIsoString(value: FirestoreTemporalPublicPage["updatedAt"]): string | null {
  if (!value) return null;
  if (typeof (value as any)?.toDate === "function") {
    const date = (value as any).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function sanitizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function getTemporalPublicPage(): Promise<TemporalPublicPageData> {
  const snap = await adminDb().collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return DEFAULT_TEMPORAL_PUBLIC_PAGE;

  const data = (snap.data() || {}) as FirestoreTemporalPublicPage;

  return {
    active: !!data.active,
    eyebrow: sanitizeString(data.eyebrow, DEFAULT_TEMPORAL_PUBLIC_PAGE.eyebrow),
    title: sanitizeString(data.title, DEFAULT_TEMPORAL_PUBLIC_PAGE.title),
    summary: sanitizeString(data.summary, DEFAULT_TEMPORAL_PUBLIC_PAGE.summary),
    primaryTitle: sanitizeString(data.primaryTitle, DEFAULT_TEMPORAL_PUBLIC_PAGE.primaryTitle),
    primaryBody: sanitizeString(data.primaryBody, DEFAULT_TEMPORAL_PUBLIC_PAGE.primaryBody),
    secondaryTitle: sanitizeString(data.secondaryTitle, DEFAULT_TEMPORAL_PUBLIC_PAGE.secondaryTitle),
    secondaryBody: sanitizeString(data.secondaryBody, DEFAULT_TEMPORAL_PUBLIC_PAGE.secondaryBody),
    ctaLabel: sanitizeString(data.ctaLabel),
    ctaHref: sanitizeString(data.ctaHref),
    embedCode: sanitizeString(data.embedCode),
    updatedAt: toIsoString(data.updatedAt),
    updatedBy: sanitizeString(data.updatedBy) || null,
  };
}

export async function saveTemporalPublicPage(
  input: Omit<TemporalPublicPageData, "updatedAt" | "updatedBy">,
  uid: string
) {
  await adminDb().collection(COLLECTION).doc(DOC_ID).set(
    {
      ...input,
      updatedAt: Timestamp.now(),
      updatedBy: uid,
    },
    { merge: true }
  );
}
