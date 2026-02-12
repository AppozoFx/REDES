import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("__test", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
