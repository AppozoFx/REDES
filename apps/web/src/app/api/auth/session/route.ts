import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

// Debug import shape en entorno server
try {
  // eslint-disable-next-line no-console
  console.log("[session/api] typeof adminAuth", typeof adminAuth);
} catch {}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "__session";



export async function POST(req: Request) {
  try {
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

    await auth.verifyIdToken(idToken, true);

    const expiresIn = 5 * 24 * 60 * 60 * 1000; // 5 días
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const res = NextResponse.json({ ok: true });

    // ✅ set cookie sobre el mismo response que retornas
    res.cookies.set(COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(expiresIn / 1000),
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Invalid token/session", message: e?.message ?? String(e) },
      { status: 401 }
    );
  }
}

export async function DELETE() {
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
