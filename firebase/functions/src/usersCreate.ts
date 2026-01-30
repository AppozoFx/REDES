import { onRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { db, FieldValue } from "./lib/admin";
import { requireAdmin } from "./lib/security";
import { writeAudit } from "./lib/audit";

const AreaEnum = z.enum(["INSTALACIONES", "AVERIAS"]);

const CreateUserSchema = z.object({
  uid: z.string().min(10),
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  dni_ce: z.string().min(6),
  celular: z.string().min(6),
  direccion: z.string().optional(),
  email: z.string().email(),
  genero: z.string().optional(),
  nacionalidad: z.string().optional(),
  f_ingreso: z.string().optional(),
  f_nacimiento: z.string().optional(),
  rol: z.string().optional(),
  area: AreaEnum.optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).default("ACTIVO"),

  roles: z.array(z.string()).default([]),
  areas: z.array(AreaEnum).default([]),
  estadoAcceso: z.enum(["HABILITADO", "INHABILITADO"]).default("HABILITADO"),
});

export const usersCreate = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const { uid: actorUid } = await requireAdmin(req);
    const input = CreateUserSchema.parse(req.body);

    const userRef = db.doc(`usuarios/${input.uid}`);
    const accessRef = db.doc(`usuarios_access/${input.uid}`);

    await db.runTransaction(async (tx) => {
      tx.set(
        userRef,
        {
          nombres: input.nombres,
          apellidos: input.apellidos,
          dni_ce: input.dni_ce,
          celular: input.celular,
          direccion: input.direccion ?? null,
          email: input.email,
          estado: input.estado,
          f_ingreso: input.f_ingreso ?? null,
          f_nacimiento: input.f_nacimiento ?? null,
          f_registro: FieldValue.serverTimestamp(),
          genero: input.genero ?? null,
          nacionalidad: input.nacionalidad ?? null,
          rol: input.rol ?? null,
          area: input.area ?? null,
          uid: input.uid,
          audit: {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: actorUid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actorUid,
            deletedAt: null,
            deletedBy: null,
            motivoBaja: null,
          },
        },
        { merge: true }
      );

      tx.set(
        accessRef,
        {
          roles: input.roles,
          areas: input.areas,
          permissions: [],
          estadoAcceso: input.estadoAcceso,
          audit: {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: actorUid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actorUid,
            deletedAt: null,
            deletedBy: null,
            motivoBaja: null,
          },
        },
        { merge: true }
      );
    });

    await writeAudit({
      actorUid,
      action: "USER_CREATE",
      target: { collection: "usuarios", id: input.uid },
      meta: { roles: input.roles, areas: input.areas, estadoAcceso: input.estadoAcceso },
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
