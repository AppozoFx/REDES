import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

try {
  console.log("[firebase/admin] module loaded", {
    nodeEnv: process.env.NODE_ENV,
  });
} catch {}

type ServiceAccount = { projectId?: string; clientEmail: string; privateKey: string };

function getServiceAccount(): ServiceAccount | null {
  const saJson =
    process.env.ADMIN_SERVICE_ACCOUNT_JSON ||
    process.env.SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    const clientEmail =
      process.env.ADMIN_CLIENT_EMAIL ||
      process.env.GOOGLE_CLIENT_EMAIL ||
      process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey =
      process.env.ADMIN_PRIVATE_KEY ||
      process.env.GOOGLE_PRIVATE_KEY ||
      process.env.FIREBASE_PRIVATE_KEY;
    const projectId =
      process.env.ADMIN_PROJECT_ID ||
      process.env.GOOGLE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT;

    if (typeof privateKey === "string") {
      privateKey = privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    }
    if (clientEmail && privateKey) {
      if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;
      return { projectId, clientEmail, privateKey };
    }
    return null;
  }

  let obj: any;
  try {
    obj = JSON.parse(saJson);
  } catch {
    return null;
  }

  const projectId: string | undefined = obj.project_id || obj.projectId;
  let privateKey: string | undefined = obj.private_key || obj.privateKey;
  const clientEmail: string | undefined = obj.client_email || obj.clientEmail;

  if (typeof privateKey === "string") {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (!clientEmail || !privateKey) return null;
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;

  return { projectId, clientEmail, privateKey };
}

function initAdmin() {
  const apps = getApps();
  if (apps.length) return apps[0];

  const sa = getServiceAccount();
  const projectId =
    sa?.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (projectId ? `${projectId}.appspot.com` : undefined);

  if (sa) {
    try {
      return initializeApp({
        credential: cert({
          projectId: sa.projectId,
          clientEmail: sa.clientEmail,
          privateKey: sa.privateKey,
        }),
        projectId: sa.projectId || projectId,
        storageBucket,
      });
    } catch {}
  }

  try {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket,
    });
  } catch {}

  try {
    return initializeApp({
      projectId,
      storageBucket,
    });
  } catch {
    return initializeApp();
  }
}

export function adminAuth() {
  const app = initAdmin();
  return getAuth(app);
}

export function adminDb() {
  const app = initAdmin();
  return getFirestore(app);
}

export function adminStorageBucket() {
  const app = initAdmin();
  const bucketName = (app.options as any)?.storageBucket;
  if (!bucketName) {
    throw new Error("STORAGE_BUCKET_NOT_CONFIGURED");
  }
  return getStorage(app).bucket(bucketName);
}
