import { requireAdmin } from "@/core/auth/guards";

export default async function AdminHomePage() {
  const session = await requireAdmin();

  return (
    <div className="space-y-2 text-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">Zona protegida por sesiÃ³n server + RBAC.</p>

      <div className="mt-4 rounded border border-slate-200 p-4 text-sm dark:border-slate-700">
        <div><b>roles:</b> {session.access.roles.join(", ") || "(none)"}</div>
        <div><b>areas:</b> {session.access.areas.join(", ") || "(none)"}</div>
        <div><b>estadoAcceso:</b> {session.access.estadoAcceso}</div>
      </div>
    </div>
  );
}
