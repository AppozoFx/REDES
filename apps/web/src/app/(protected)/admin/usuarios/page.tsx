import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";
import UsuariosTableClient from "./UsuariosTableClient";

export default async function UsuariosListPage() {
  await requireAdmin();

  const rows = await listUsuariosAccess();

  const refs = rows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, (s.data() as any) ?? null]));

  const emailByUid = new Map<string, string | null>();
  const nombreByUid = new Map<string, string>();
  for (const r of rows) {
    const p = profileByUid.get(r.uid);
    const email = p?.email ?? null;
    const nombre = [p?.nombres, p?.apellidos].filter(Boolean).join(" ").trim() || p?.displayName || "-";
    emailByUid.set(r.uid, email);
    nombreByUid.set(r.uid, nombre);
  }

  const missing = rows.filter((r) => !emailByUid.get(r.uid));
  const MAX_AUTH_LOOKUPS = 10;
  for (const r of missing.slice(0, MAX_AUTH_LOOKUPS)) {
    try {
      const u = await adminAuth().getUser(r.uid);
      emailByUid.set(r.uid, u.email ?? null);
    } catch {}
  }

  const tableRows = rows.map((r) => ({
    uid: r.uid,
    email: emailByUid.get(r.uid) ?? "-",
    nombre: nombreByUid.get(r.uid) ?? "-",
    roles: r.roles ?? [],
    areas: r.areas ?? [],
    estadoAcceso: r.estadoAcceso ?? "INHABILITADO",
  }));

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

      <UsuariosTableClient rows={tableRows} />

      {missing.length > 10 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
          Nota: se muestran emails de Auth solo para los primeros {MAX_AUTH_LOOKUPS} usuarios sin perfil.
        </div>
      )}
    </div>
  );
}
