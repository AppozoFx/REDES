import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export async function verifyFirebaseToken(req: any) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new Error("UNAUTHENTICATED");

  const idToken = match[1];
  const decoded = await getAuth().verifyIdToken(idToken);
  return decoded; // { uid, ... }
}

export async function assertIsAdmin(uid: string) {
  const db = getFirestore();
  const snap = await db.doc(`usuarios_access/${uid}`).get();
  if (!snap.exists) throw new Error("FORBIDDEN");

  const data = snap.data()!;
  const enabled = data.estadoAcceso === "HABILITADO";
  const roles: string[] = data.roles ?? [];

  if (!(enabled && roles.includes("ADMIN"))) throw new Error("FORBIDDEN");
}
