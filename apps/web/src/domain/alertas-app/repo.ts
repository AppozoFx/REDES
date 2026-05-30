"use client";

import {
  collection,
  onSnapshot,
  query,
  where,
  getFirestore,
} from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase/client";

let cachedDb: ReturnType<typeof getFirestore> | null = null;
function getDb() {
  if (typeof window === "undefined") return null;
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  cachedDb = getFirestore(app);
  return cachedDb;
}

export type AlertaAppDoc = {
  id: string;
  tipo: string;
  estado: "PENDIENTE" | "ACEPTADA" | "RECHAZADA";
  cuadrillaId: string;
  cuadrillaNombre: string;
  emisorUid: string;
  emisorNombre: string;
  rolesDestino: string[];
  ymd: string;
  creadoAt?: any;
  respondidoAt?: any;
  respondidoPorUid: string | null;
  respondidoPorNombre: string | null;
  respondidoPorRol: string | null;
};

function tsMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function mapDoc(d: any): AlertaAppDoc {
  const x = d.data() as any;
  return {
    id: d.id,
    tipo: String(x.tipo || ""),
    estado: x.estado as AlertaAppDoc["estado"],
    cuadrillaId: String(x.cuadrillaId || ""),
    cuadrillaNombre: String(x.cuadrillaNombre || ""),
    emisorUid: String(x.emisorUid || ""),
    emisorNombre: String(x.emisorNombre || ""),
    rolesDestino: Array.isArray(x.rolesDestino) ? x.rolesDestino : [],
    ymd: String(x.ymd || ""),
    creadoAt: x.creadoAt ?? null,
    respondidoAt: x.respondidoAt ?? null,
    respondidoPorUid: x.respondidoPorUid ?? null,
    respondidoPorNombre: x.respondidoPorNombre ?? null,
    respondidoPorRol: x.respondidoPorRol ?? null,
  };
}

// Escucha TODOS los alertas de hoy (PENDIENTE + historial ACEPTADA/RECHAZADA)
export function listenAlertasAppHoy(
  onChange: (items: AlertaAppDoc[]) => void
): () => void {
  const db = getDb();
  if (!db) { onChange([]); return () => {}; }

  const q = query(
    collection(db, "alertas_app"),
    where("ymd", "==", todayLimaYmd())
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map(mapDoc)
        .sort((a, b) => tsMillis(b.creadoAt) - tsMillis(a.creadoAt));
      onChange(items);
    },
    (error) => {
      console.error("[listenAlertasAppHoy]", error?.code, error?.message);
      onChange([]);
    }
  );
}

export function listenAlertasAppPendientes(
  onChange: (items: AlertaAppDoc[]) => void
): () => void {
  const db = getDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  // Solo filtramos por estado para evitar índice compuesto.
  // Firestore no necesita índice para una sola cláusula where.
  const q = query(
    collection(db, "alertas_app"),
    where("estado", "==", "PENDIENTE")
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map(mapDoc)
        .sort((a, b) => tsMillis(b.creadoAt) - tsMillis(a.creadoAt));
      onChange(items);
    },
    (error) => {
      console.error("[listenAlertasAppPendientes]", error?.code, error?.message);
      onChange([]);
    }
  );
}
