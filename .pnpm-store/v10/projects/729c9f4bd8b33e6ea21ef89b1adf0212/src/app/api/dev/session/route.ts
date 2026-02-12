import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const store = await cookies();
  const sessionCookie = store.get("__session")?.value;

  const session = await getServerSession();

  return NextResponse.json({
    ok: true,
    hasSessionCookie: Boolean(sessionCookie),
    session,
    isAdmin: session?.isAdmin ?? false,
    roles: session?.access.roles ?? [],
    estadoAcceso: session?.access.estadoAcceso ?? null,
  });
}

