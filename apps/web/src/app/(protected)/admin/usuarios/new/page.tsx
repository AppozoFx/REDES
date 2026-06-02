import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { FormCreateUsuario } from "./FormCreateUsuario";

export default async function NewUsuarioPage() {
  await requirePermission("USERS_CREATE");

  const rolesSnap = await adminDb().collection("roles").where("estado", "==", "ACTIVO").get();
  const roles = rolesSnap.docs.map((d) => d.id).filter((r) => r !== "ADMIN");

  const modSnap = await adminDb().collection("modulos").where("estado", "==", "ACTIVO").orderBy("orden", "asc").get();

  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS", "PERMISSIONS"].includes(k));

  return (
    <div className="mx-auto max-w-5xl space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#30518c] shadow-[0_8px_20px_rgba(48,81,140,.3)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Nuevo usuario</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Registra perfil, acceso y asignaciones iniciales del usuario.</p>
          </div>
        </div>
      </div>

      <FormCreateUsuario roles={roles} areas={areas} cancelHref="/admin/usuarios" />
    </div>
  );
}
