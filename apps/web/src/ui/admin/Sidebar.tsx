import Link from "next/link";

export function AdminSidebar({
  isAdmin,
  areas,
}: {
  isAdmin: boolean;
  areas: string[];
}) {
  // En Paso 1 solo dejamos enlaces base (roles/modulos vendrán en Paso 2-2)
  const items = [
    { href: "/admin", label: "Dashboard", show: true },
    { href: "/admin/roles", label: "Roles", show: isAdmin },
    { href: "/admin/modulos", label: "Módulos", show: isAdmin },
  ].filter((x) => x.show);

  return (
    <aside className="w-64 border-r p-4">
      <div className="text-lg font-semibold">REDES Admin</div>

      <nav className="mt-4 space-y-2">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className="block rounded px-3 py-2 hover:bg-black/5">
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 text-xs opacity-70">
        <div><b>Áreas:</b> {areas.join(", ") || "(none)"}</div>
      </div>
    </aside>
  );
}
