"use client";

import Link from "next/link";
import { NotificationsBell } from "@/ui/common/NotificationsBell";

type Props = {
  uid: string;
};

export default function Topbar({ uid }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm font-semibold">
          REDES
        </Link>

        <span className="text-xs opacity-70">uid: {uid}</span>
      </div>

      <div className="flex items-center gap-3">
        <NotificationsBell uid={uid} />

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
