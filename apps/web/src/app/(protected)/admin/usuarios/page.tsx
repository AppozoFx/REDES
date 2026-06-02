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

  const habilitados = tableRows.filter((r) => String(r.estadoAcceso).toUpperCase() === "HABILITADO").length;
  const inhabilitados = tableRows.length - habilitados;

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#30518c] shadow-[0_8px_20px_rgba(48,81,140,.3)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Usuarios</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gestiona cuentas, roles y estado de acceso administrativo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {rows.length} usuarios
          </span>
          <Link
            href="/admin/usuarios/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo usuario
          </Link>
        </div>
      </div>

      {/* ── KPI mini ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-bold">{rows.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm dark:border-emerald-800 dark:from-emerald-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Habilitados</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{habilitados}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 shadow-sm dark:border-rose-800 dark:from-rose-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Inhabilitados</p>
          <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-300">{inhabilitados}</p>
        </div>
      </div>

      <UsuariosTableClient rows={tableRows} />

      {missing.length > 10 && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Se muestran emails de Auth solo para los primeros {MAX_AUTH_LOOKUPS} usuarios sin perfil.
        </div>
      )}
    </div>
  );
}
