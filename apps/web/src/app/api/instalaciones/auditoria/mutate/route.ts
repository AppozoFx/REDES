import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function asStr(v: any) {
  return String(v || "").trim();
}

function rolesOf(session: any) {
  return (session.access.roles || []).map((r: any) => String(r || "").toUpperCase());
}

function canUse(session: any) {
  const roles = rolesOf(session);
  return (
    session.isAdmin ||
    (session.access.areas || []).includes("INSTALACIONES") ||
    roles.includes("COORDINADOR") ||
    roles.includes("TECNICO") ||
    session.permissions.includes("EQUIPOS_VIEW") ||
    session.permissions.includes("EQUIPOS_EDIT")
  );
}

function canEdit(session: any) {
  if (session.isAdmin) return true;
  const roles = rolesOf(session);
  if (roles.includes("COORDINADOR") || roles.includes("TECNICO")) return false;
  return (session.access.areas || []).includes("INSTALACIONES") || session.permissions.includes("EQUIPOS_EDIT");
}

function shortName(full: string) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first || full;
}

function normalizeSns(input: unknown): string[] {
  return Array.from(
    new Set<string>(
      (Array.isArray(input) ? input : [])
        .map((s: unknown) => asStr(s).toUpperCase())
        .filter(Boolean)
    )
  );
}

async function findEquiposBySns(db: ReturnType<typeof adminDb>, sns: string[]) {
  const found = new Map<string, { id: string; data: any }>();
  const notFound = new Set(sns);
  for (let i = 0; i < sns.length; i += 10) {
    const chunk = sns.slice(i, i + 10);
    const snap = await db.collection("equipos").where("SN", "in", chunk).limit(1000).get();
    for (const d of snap.docs) {
      const data = d.data() as any;
      const sn = asStr(data?.SN).toUpperCase();
      if (!sn) continue;
      found.set(sn, { id: d.id, data });
      notFound.delete(sn);
    }
  }
  return { found, notFound };
}

function photoCandidates(eq: any) {
  const out = new Set<string>();
  const p = asStr(eq?.auditoria?.fotoPath);
  if (p) out.add(p);
  const sn = asStr(eq?.SN).toUpperCase();
  if (sn) {
    out.add(`auditoria/${sn}.jpg`);
    out.add(`auditoria/${sn}.png`);
    out.add(`auditoria/${sn}.jpeg`);
  }
  return Array.from(out);
}

async function deletePhotoIfAny(eq: any) {
  const bucket = adminStorageBucket();
  const paths = photoCandidates(eq);
  for (const path of paths) {
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
      if (asStr(eq?.auditoria?.fotoPath) === path) return;
    } catch {
      // noop
    }
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canUse(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = asStr(body?.action).toLowerCase();

    if (!canEdit(session)) {
      return NextResponse.json({ ok: false, error: "READ_ONLY_ROLE" }, { status: 403 });
    }

    const db = adminDb();
    const userSnap = await db.collection("usuarios").doc(session.uid).get();
    const u = userSnap.exists ? (userSnap.data() as any) : {};
    const actorName = shortName(`${asStr(u?.nombres || u?.nombre)} ${asStr(u?.apellidos)}`.trim() || session.uid);

    if (action === "save_observaciones") {
      const changes = Array.isArray(body?.changes) ? body.changes : [];
      if (!changes.length) return NextResponse.json({ ok: true, saved: 0 });
      let saved = 0;
      for (let i = 0; i < changes.length; i += 450) {
        const batch = db.batch();
        for (const c of changes.slice(i, i + 450)) {
          const id = asStr(c?.id);
          if (!id) continue;
          const observacion = asStr(c?.observacion);
          batch.update(db.collection("equipos").doc(id), { observacion });
          saved += 1;
        }
        await batch.commit();
      }
      return NextResponse.json({ ok: true, saved });
    }

    if (action === "analizar_sns") {
      const sns = normalizeSns(body?.sns);
      if (!sns.length) return NextResponse.json({ ok: false, error: "NO_SN" }, { status: 400 });
      const { notFound } = await findEquiposBySns(db, sns);
      return NextResponse.json({
        ok: true,
        total: sns.length,
        encontrados: sns.length - notFound.size,
        noEncontrados: Array.from(notFound),
      });
    }

    if (action === "marcar_masivo") {
      const sns = normalizeSns(body?.sns);
      if (!sns.length) return NextResponse.json({ ok: false, error: "NO_SN" }, { status: 400 });

      const { found, notFound } = await findEquiposBySns(db, sns);

      let saved = 0;
      for (let i = 0; i < sns.length; i += 400) {
        const batch = db.batch();
        const notif = db.batch();
        for (const sn of sns.slice(i, i + 400)) {
          const item = found.get(sn);
          if (!item) continue;
          const ref = db.collection("equipos").doc(item.id);
          batch.set(
            ref,
            {
              auditoria: {
                requiere: true,
                estado: "pendiente",
                fotoPath: asStr(item?.data?.auditoria?.fotoPath || `auditoria/${sn}.jpg`),
                fotoURL: asStr(item?.data?.auditoria?.fotoURL),
                marcadoPor: session.uid,
                marcadoPorNombre: actorName,
                actualizadoEn: FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
          const nref = db.collection("notificaciones").doc();
          notif.set(nref, {
            tipo: "Auditoria - Marcar SN",
            mensaje: `${actorName} marco el SN ${sn} para auditoria.`,
            usuario: actorName,
            fecha: FieldValue.serverTimestamp(),
            visto: false,
            detalles: {
              sn,
              equipo: asStr(item?.data?.equipo),
              de: asStr(item?.data?.ubicacion),
              a: "auditoria pendiente",
            },
          });
          saved += 1;
        }
        await batch.commit();
        await notif.commit();
      }

      return NextResponse.json({ ok: true, saved, notFound: Array.from(notFound) });
    }

    if (action === "limpiar_uno") {
      const id = asStr(body?.id);
      if (!id) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
      const ref = db.collection("equipos").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
      const eq = snap.data() as any;
      await deletePhotoIfAny(eq);
      await ref.update({ auditoria: FieldValue.delete() });
      return NextResponse.json({ ok: true });
    }

    if (action === "nueva_auditoria") {
      const snap = await db.collection("equipos").where("auditoria.requiere", "==", true).limit(12000).get();
      const docs = snap.docs;
      let cleaned = 0;
      let photos = 0;
      for (let i = 0; i < docs.length; i += 25) {
        await Promise.all(
          docs.slice(i, i + 25).map(async (d) => {
            const eq = d.data() as any;
            try {
              await deletePhotoIfAny(eq);
              photos += 1;
            } catch {
              // noop
            }
          })
        );
      }
      for (let i = 0; i < docs.length; i += 450) {
        const batch = db.batch();
        for (const d of docs.slice(i, i + 450)) {
          batch.update(d.ref, { auditoria: FieldValue.delete() });
          cleaned += 1;
        }
        await batch.commit();
      }
      return NextResponse.json({ ok: true, cleaned, photos });
    }

    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}



