"use client";

import type { ServerSession } from "@/core/auth/session";

export default function HomeTopbar({ session }: { session: ServerSession }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">uid: {session.uid}</div>

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
  );
}
