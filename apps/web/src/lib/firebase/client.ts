"use client"; // Clave para evitar que el servidor intente ejecutar este SDK

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

// Debug mínimo de carga del módulo en cliente
if (typeof window !== "undefined") {
  try {
    // eslint-disable-next-line no-console
    console.log("[firebase/client] module loaded", { ts: Date.now() });
  } catch {}
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, // Corregido de storage_bucket
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Variables para el Singleton en memoria del cliente
let appInstance: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let analyticsInstance: Analytics | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") return {} as FirebaseApp; // Guardrail para SSR

  if (!appInstance) {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  try {
    // eslint-disable-next-line no-console
    console.log("[firebase/client] getFirebaseApp", { projectId: (appInstance.options as any)?.projectId });
  } catch {}
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") return {} as Auth; // Evita el error "n.getFirebaseAuth is not a function"

  if (!authInstance) {
    const app = getFirebaseApp();
    authInstance = getAuth(app);
    try {
      // eslint-disable-next-line no-console
      console.log("[firebase/client] auth initialized", { projectId: (authInstance.app.options as any)?.projectId });
    } catch {}
  }
  try {
    // eslint-disable-next-line no-console
    console.log("[firebase/client] getFirebaseAuth typeof", typeof getFirebaseAuth);
  } catch {}
  return authInstance;
}

export const initAnalytics = async () => {
  if (typeof window !== "undefined" && !analyticsInstance) {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(getFirebaseApp());
      return analyticsInstance;
    }
  }
  return null;
};
