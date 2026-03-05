import { requireAuth, requirePermission } from "@/core/auth/guards";
import { getUsuarioProfileByUid } from "@/domain/usuarios/repo";
import LocalTime from "@/ui/LocalTime";
import UserEditOperativeForm from "@/ui/home/usuarios/UserEditOperativeForm";
import Link from "next/link";

function toMs(v: any): number | null {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis(); // Timestamp
  if (v instanceof Date) return v.getTime();
  return null;
}

export default async function HomeUsuariosEditPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  await requireAuth();
  await requirePermission("USERS_LIST");

  const { uid } = await params;
  const profile = await getUsuarioProfileByUid(uid);

  if (!profile) return <div>Usuario no encontrado.</div>;

  const defaults = {
    nombres: profile.nombres ?? "",
    apellidos: profile.apellidos ?? "",
    celular: profile.celular ?? "",
    direccion: profile.direccion ?? "",
  };

  const fIngresoMs = toMs(profile.fIngreso);
  const fNacimientoMs = toMs(profile.fNacimiento);

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center">
        <Link
          href="/home/usuarios"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          Regresar a usuarios
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Editar usuario</h1>
        <div className="font-mono text-sm text-slate-500 dark:text-slate-400">{uid}</div>
      </div>

      <div className="space-y-1 rounded border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
        <div>F. Ingreso: {fIngresoMs ? <LocalTime dateMs={fIngresoMs} /> : "-"}</div>
        <div>F. Nacimiento: {fNacimientoMs ? <LocalTime dateMs={fNacimientoMs} /> : "-"}</div>
      </div>

      <UserEditOperativeForm uid={uid} defaults={defaults} />
    </div>
  );
}
