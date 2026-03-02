import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";

export default async function UsuariosListPage() {
  await requireAdmin();

  const rows = await listUsuariosAccess(50);

  const refs = rows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, (s.data() as any) ?? null]));

  const emailByUid = new Map<string, string | null>();
  for (const r of rows) {
    const p = profileByUid.get(r.uid);
    const email = p?.email ?? null;
    emailByUid.set(r.uid, email);
  }

  const missing = rows.filter((r) => !emailByUid.get(r.uid));
  const MAX_AUTH_LOOKUPS = 10;
  for (const r of missing.slice(0, MAX_AUTH_LOOKUPS)) {
    try {
      const u = await adminAuth().getUser(r.uid);
      emailByUid.set(r.uid, u.email ?? null);
    } catch {}
  }

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Usuarios</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestiona cuentas, roles y estado de acceso administrativo.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
              Total: <b>{rows.length}</b>
            </div>
            <Link className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700" href="/admin/usuarios/new">
              Nuevo usuario
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-3 text-left font-semibold">Email</th>
                <th className="p-3 text-left font-semibold">Roles</th>
                <th className="p-3 text-left font-semibold">Areas</th>
                <th className="p-3 text-left font-semibold">Estado</th>
                <th className="p-3 text-left font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3">{emailByUid.get(r.uid) ?? "-"}</td>
                  <td className="p-3">{(r.roles ?? []).join(", ") || "-"}</td>
                  <td className="p-3">{(r.areas ?? []).join(", ") || "-"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        String(r.estadoAcceso || "").toUpperCase() === "HABILITADO"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      }`}
                    >
                      {r.estadoAcceso}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      href={`/admin/usuarios/${r.uid}`}
                    >
                      Ver / editar
                    </Link>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                    No hay usuarios todavia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {missing.length > 10 && (
          <div className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Nota: se muestran emails de Auth solo para los primeros {MAX_AUTH_LOOKUPS} usuarios sin perfil.
          </div>
        )}
      </section>
    </div>
  );
}
