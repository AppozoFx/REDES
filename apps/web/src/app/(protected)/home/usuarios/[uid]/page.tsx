import { requireAuth, requirePermission } from "@/core/auth/guards";
import { getUsuarioProfileByUid } from "@/domain/usuarios/repo";
import LocalTime from "@/ui/LocalTime";
import UserEditOperativeForm from "@/ui/home/usuarios/UserEditOperativeForm";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Editar usuario</h1>
        <div className="text-sm text-muted-foreground font-mono">{uid}</div>
      </div>

      <div className="rounded border p-4 text-sm space-y-1">
        <div>F. Ingreso: {fIngresoMs ? <LocalTime dateMs={fIngresoMs} /> : "-"}</div>
        <div>F. Nacimiento: {fNacimientoMs ? <LocalTime dateMs={fNacimientoMs} /> : "-"}</div>
      </div>

      <UserEditOperativeForm uid={uid} defaults={defaults} />
    </div>
  );
}
