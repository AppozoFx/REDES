"use client";

import Link from "next/link";
import type { ServerSession } from "@/core/auth/session";
import { NotificationsBell } from "@/ui/common/NotificationsBell";


export default function HomeTopbar({ session }: { session: ServerSession }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">uid: {session.uid}</div>

      <div className="flex items-center gap-3">
        {session.isAdmin ? (
          <Link href="/admin" className="rounded border px-3 py-1 text-sm hover:bg-muted">
            Ir a Admin
          </Link>
        ) : null}

        <NotificationsBell uid={session.uid} />
        <button
          className="rounded border px-3 py-1 text-sm hover:bg-muted"
          onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE" });
            window.location.href = "/login";
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
