import { onRequest } from "firebase-functions/v2/https";
import { db, FieldValue } from "./lib/admin";
import { requireAuth } from "./lib/security";
import { writeAudit } from "./lib/audit";

export const bootstrapAdmin = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const { uid } = await requireAuth(req);

    const existingAdmin = await db
      .collection("usuarios_access")
      .where("estadoAcceso", "==", "HABILITADO")
      .where("roles", "array-contains", "ADMIN")
      .limit(1)
      .get();

    if (!existingAdmin.empty) {
      res.status(409).json({ ok: false, error: "ADMIN_ALREADY_EXISTS" });
      return;
    }

    const ref = db.doc(`usuarios_access/${uid}`);
    await ref.set(
      {
        roles: ["ADMIN"],
        areas: ["INSTALACIONES", "AVERIAS"],
        estadoAcceso: "HABILITADO",
        audit: {
          createdAt: FieldValue.serverTimestamp(),
          createdBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        },
      },
      { merge: true }
    );

    await writeAudit({
      actorUid: uid,
      action: "BOOTSTRAP_ADMIN",
      target: { collection: "usuarios_access", id: uid },
      meta: { roles: ["ADMIN"] },
    });

    res.json({ ok: true });
    return;
  } catch (e: any) {
    const msg = e?.message || "ERROR";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    res.status(status).json({ ok: false, error: msg });
    return;
  }
});
