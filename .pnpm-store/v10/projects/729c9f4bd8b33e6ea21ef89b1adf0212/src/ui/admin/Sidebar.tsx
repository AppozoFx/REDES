import Link from "next/link";
import { buildAdminNav } from "@/core/rbac/buildAdminNav";

export async function AdminSidebar({
  isAdmin,
  areas,
}: {
  isAdmin: boolean;
  areas: string[];
}) {
  const items = await buildAdminNav({ isAdmin, areas });

  return (
    <aside className="w-64 border-r p-4">
      <div className="text-lg font-semibold">REDES Admin</div>

      <nav className="mt-4 space-y-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="block rounded px-3 py-2 hover:bg-black/5"
          >
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 text-xs opacity-70">
        <div>
          <b>Áreas:</b> {areas.join(", ") || "(none)"}
        </div>
      </div>
    </aside>
  );
}
