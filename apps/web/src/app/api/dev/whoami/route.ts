import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET() {
  const store = await cookies();
  const sessionCookie = store.get("__session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ ok: false, hasSessionCookie: false });
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    return NextResponse.json({ ok: true, hasSessionCookie: true, uid: decoded.uid });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      hasSessionCookie: true,
      error: e?.message ?? String(e),
    });
  }
}
