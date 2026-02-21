import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "__session";
const LOGIN_NOTIFY_WINDOW_MS = 5 * 60 * 1000;

function shortName(nombres: string, apellidos: string, fallback: string) {
  const n = String(nombres || "").trim().split(/\s+/).filter(Boolean);
  const a = String(apellidos || "").trim().split(/\s+/).filter(Boolean);
  const first = n[0] || "";
  const firstLast = a[0] || "";
  const out = `${first} ${firstLast}`.trim();
  return out || fallback;
}



export async function POST(req: Request) {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const { idToken } = (await req.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ ok: false, error: "Missing idToken" }, { status: 400 });
    }

    // ✅ valida token real (detecta mismatch emulador/real)
    const auth = adminAuth();
    try {
      // eslint-disable-next-line no-console
      console.log("[session/api] admin projectId", (auth.app?.options as any)?.projectId);
    } catch {}

    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded?.uid || "";

    // Maximo permitido por Firebase para session cookies: 14 dias.
    // El cierre al cerrar todas las pestanas lo controla TabSessionGuard.
    const expiresIn = 14 * 24 * 60 * 60 * 1000;
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const res = NextResponse.json({ ok: true });

    // ✅ set cookie sobre el mismo response que retornas
    res.cookies.set(COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Presencia global (usuarios_presencia) al iniciar sesion
    try {
      const accessSnap = await adminDb().collection("usuarios_access").doc(uid).get();
      const access = accessSnap.exists ? (accessSnap.data() as any) : {};
      await adminDb()
        .collection("usuarios_presencia")
        .doc(uid)
        .set(
          {
            uid,
            online: true,
            source: "WEB",
            roles: Array.isArray(access?.roles) ? access.roles : [],
            areas: Array.isArray(access?.areas) ? access.areas : [],
            estadoAcceso: String(access?.estadoAcceso || "HABILITADO"),
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch {}

    // Notificacion global de ingreso con anti-spam (1 cada 5 min por usuario)
    try {
      const uSnap = await adminDb().collection("usuarios").doc(uid).get();
      const u = uSnap.exists ? (uSnap.data() as any) : {};
      const actor = shortName(String(u?.nombres || ""), String(u?.apellidos || ""), uid);
      const stateRef = adminDb().collection("auth_login_notify_state").doc(uid);
      const stateSnap = await stateRef.get();
      const lastTs = stateSnap.get("lastNotifiedAt");
      const lastMs = typeof lastTs?.toMillis === "function" ? lastTs.toMillis() : 0;
      const now = Date.now();

      if (!lastMs || now - lastMs >= LOGIN_NOTIFY_WINDOW_MS) {
        await adminDb().collection("notificaciones").add({
          title: "Ingreso de usuario",
          message: `${actor} acaba de ingresar a la aplicacion.`,
          type: "info",
          scope: "ALL",
          createdBy: actor,
          entityType: "AUTH",
          entityId: uid,
          action: "CREATE",
          estado: "ACTIVO",
          createdAt: FieldValue.serverTimestamp(),
        });
        await stateRef.set(
          {
            lastNotifiedAt: FieldValue.serverTimestamp(),
            actor,
          },
          { merge: true }
        );
      }
    } catch (notifErr) {
      // eslint-disable-next-line no-console
      console.warn("[session/api] login notification failed", notifErr);
    }

    return res;
  } catch (e: any) {
    const message = String(e?.message || e || "ERROR");
    const code = String((e as any)?.code || "");
    const status =
      code.includes("auth/") ||
      message.toUpperCase().includes("TOKEN")
        ? 401
        : 500;
    try {
      // eslint-disable-next-line no-console
      console.error("[session/api] POST error", { code, message, stack: e?.stack });
    } catch {}
    return NextResponse.json(
      { ok: false, error: "SESSION_CREATE_FAILED", code, message },
      { status }
    );
  }
}

export async function DELETE() {
  try {
    const { adminAuth, adminDb } = await import("@/lib/firebase/admin");
    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAME)?.value;
    if (raw) {
      const decoded = await adminAuth().verifySessionCookie(raw, false);
      const uid = String(decoded?.uid || "");
      if (uid) {
        await adminDb()
          .collection("usuarios_presencia")
          .doc(uid)
          .set(
            {
              uid,
              online: false,
              source: "WEB",
              lastSeenAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    }
  } catch {}

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
