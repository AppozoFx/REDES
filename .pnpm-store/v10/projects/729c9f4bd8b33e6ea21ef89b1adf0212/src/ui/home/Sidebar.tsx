import Link from "next/link";
import type { ServerSession } from "@/core/auth/session";
import { buildHomeNav } from "@/core/rbac/buildHomeNav";

export default function HomeSidebar({ session }: { session: ServerSession }) {
  const items = buildHomeNav(session);

  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold">REDES</div>
        <div className="text-xs text-muted-foreground">
          roles: {session.access.roles.join(", ")}
        </div>
      </div>

      <nav className="space-y-1">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className="block rounded px-3 py-2 hover:bg-muted"
          >
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="pt-4 text-xs text-muted-foreground">
        Áreas: {session.access.areas.join(", ")}
      </div>
    </div>
  );
}
