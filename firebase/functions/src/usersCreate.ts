import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { UsersCreateSchema } from "./schemas/usersCreate.schema";
import { verifyFirebaseToken, assertIsAdmin } from "./utils/authz";

export const usersCreate = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const decoded = await verifyFirebaseToken(req);
    await assertIsAdmin(decoded.uid);

    const parsed = UsersCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "BAD_REQUEST", details: parsed.error.flatten() });
      return;
    }

    const input = parsed.data;

    // 1) Crear Auth user
    const userRecord = await getAuth().createUser({
      email: input.email,
      password: input.password ?? undefined,
      disabled: input.estadoAcceso !== "HABILITADO",
    });

    const newUid = userRecord.uid;
    const db = getFirestore();
    const now = FieldValue.serverTimestamp();

    const finalRoles = Array.from(new Set([...(input.roles ?? [])]));
    const finalAreas = Array.from(new Set([...(input.areas ?? [])]));

    const batch = db.batch();

    batch.set(db.doc(`usuarios/${newUid}`), {
      uid: newUid,
      nombres: input.nombres,
      apellidos: input.apellidos,
      dni_ce: input.dni_ce,
      celular: input.celular,
      direccion: input.direccion ?? "",
      email: input.email,
      estado: input.estado,

      f_ingreso: null,
      f_nacimiento: null,
      f_registro: now,

      genero: input.genero ?? null,
      nacionalidad: input.nacionalidad ?? null,

      rol: input.rol,
      area: input.area,

      audit: {
        createdAt: now,
        createdBy: decoded.uid,
        updatedAt: now,
        updatedBy: decoded.uid,
        deletedAt: null,
        deletedBy: null,
        motivoBaja: null,
      },
    });

    batch.set(db.doc(`usuarios_access/${newUid}`), {
      roles: finalRoles,
      areas: finalAreas,
      permissions: [],
      estadoAcceso: input.estadoAcceso,
      audit: {
        createdAt: now,
        createdBy: decoded.uid,
        updatedAt: now,
        updatedBy: decoded.uid,
        deletedAt: null,
        deletedBy: null,
        motivoBaja: null,
      },
    });

    const auditRef = db.collection("auditoria").doc();
    batch.set(auditRef, {
      action: "USERS_CREATE",
      actorUid: decoded.uid,
      meta: {
        target: { collection: "usuarios", id: newUid },
        email: input.email,
        roles: finalRoles,
        areas: finalAreas,
      },
      ts: now,
    });

    await batch.commit();

    logger.info("usersCreate ok", { actorUid: decoded.uid, newUid });

    res.status(201).json({ ok: true, uid: newUid });
    return;
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      return;
    }
    if (msg === "FORBIDDEN") {
      res.status(403).json({ ok: false, error: "FORBIDDEN" });
      return;
    }

    logger.error("usersCreate error", e);
    res.status(500).json({ ok: false, error: "INTERNAL" });
    return;
  }
});
