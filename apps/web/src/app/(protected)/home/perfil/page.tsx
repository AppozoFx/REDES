import { requireAuth } from "@/core/auth/guards";
import { getUsuarioProfileByUid } from "@/domain/usuarios/repo";
import PerfilForm from "@/ui/home/perfil/PerfilForm";

function tsToYmd(v: any): string {
  if (!v) return "-";
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy}`;
}

function tsToInputYmd(v: any): string {
  if (!v) return "";
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function PerfilPage() {
  const session = await requireAuth();
  const profile = await getUsuarioProfileByUid(session.uid);

  const defaults = {
    celular: (profile?.celular as string) ?? "",
    direccion: (profile?.direccion as string) ?? "",
    nombreCompleto: `${String(profile?.nombres ?? "").trim()} ${String(profile?.apellidos ?? "").trim()}`.trim(),
    email: String(profile?.email ?? ""),
    tipoDoc: String(profile?.tipoDoc ?? ""),
    nroDoc: String(profile?.nroDoc ?? ""),
    fIngreso: tsToYmd(profile?.fIngreso),
    fNacimiento: tsToYmd(profile?.fNacimiento),
    fNacimientoInput: tsToInputYmd(profile?.fNacimiento),
    roles: session.access.roles ?? [],
    areas: session.access.areas ?? [],
    estadoAcceso: session.access.estadoAcceso,
  };

  return (
    <div className="space-y-4 p-1">
      <PerfilForm defaults={defaults} />
    </div>
  );
}
