/**
 * Crea/actualiza el documento app_config/android en Firestore.
 *
 * Este documento controla el Force Update en REDES-MOBILE:
 *   - versionMinima: si el versionCode de la app instalada es menor a este número,
 *     la app muestra la pantalla de actualización obligatoria y bloquea el acceso.
 *   - versionNominalMinima: texto legible (ej. "1.0.12") que se muestra al usuario.
 *   - mensaje: texto personalizado que ve el usuario en la pantalla de bloqueo.
 *
 * Para forzar actualización al próximo release:
 *   1. Sube el versionCode en app/build.gradle.kts (ej. 13)
 *   2. Actualiza versionMinima aquí a 13 y vuelve a ejecutar el script.
 *
 * Uso:
 *   cd C:\Proyectos\REDES\firebase\functions
 *   npx ts-node --project tsconfig.json ..\scripts\init_app_config_android.ts
 */

import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SERVICE_ACCOUNT_PATH = path.resolve(
  __dirname,
  "../../redes-5bb81-firebase-adminsdk-fbsvc-17d5f3433a.json"
);

if (!getApps().length) {
  initializeApp({ credential: cert(SERVICE_ACCOUNT_PATH as any) });
}

const db = getFirestore();

async function main() {
  const ref = db.collection("app_config").doc("android");

  const data = {
    // Versión mínima requerida (versionCode de build.gradle.kts).
    // Actualmente la app en producción tiene versionCode = 12.
    // Cuando subas a versionCode 13, cambia este valor a 13 para bloquear el 12.
    versionMinima: 12,

    // Texto que se muestra en el diálogo de actualización
    versionNominalMinima: "1.0.11",

    // Mensaje visible al usuario cuando su versión está bloqueada
    mensaje: "Hay una nueva versión disponible. Por favor actualiza la aplicación para continuar usando REDES.",

    updatedAt: new Date().toISOString(),
  };

  await ref.set(data, { merge: true });
  console.log("✅  app_config/android creado/actualizado:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
