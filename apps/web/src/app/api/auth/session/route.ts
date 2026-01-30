import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

const COOKIE_NAME = "__session";

export async function POST(req: Request) {
  try {
    const { idToken } = (await req.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const expiresIn = 5 * 24 * 60 * 60 * 1000; // 5 días
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });

    const cookieStore = await cookies(); // ✅ clave (cookies() es async en tu setup)
    cookieStore.set(COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(expiresIn / 1000),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Importante: devuelve 401 solo si realmente es auth, pero por ahora ok.
    return NextResponse.json({ error: "Invalid token/session" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies(); // ✅ igual aquí
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
