import { requireAdmin } from "@/core/auth/guards";

export default async function AdminHomePage() {
  const session = await requireAdmin();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm opacity-80">Zona protegida por sesión server + RBAC.</p>

      <div className="mt-4 rounded border p-4 text-sm">
        <div><b>roles:</b> {session.access.roles.join(", ") || "(none)"}</div>
        <div><b>areas:</b> {session.access.areas.join(", ") || "(none)"}</div>
        <div><b>estadoAcceso:</b> {session.access.estadoAcceso}</div>
      </div>
    </div>
  );
}
