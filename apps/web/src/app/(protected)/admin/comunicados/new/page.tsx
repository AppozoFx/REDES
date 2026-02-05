import { requirePermission } from "@/core/auth/guards";
import { listRoles } from "@/domain/roles/repo";
import ComunicadoCreateFormClient from "@/ui/admin/comunicados/ComunicadoCreateFormClient";

const PERM = "ANNOUNCEMENTS_MANAGE";

export default async function ComunicadoCreatePage() {
  await requirePermission(PERM);

  const roles = await listRoles(100);
  const rolesCatalog = roles.map((r: any) => ({
    id: String(r.id),
    nombre: String(r.nombre ?? r.id),
  }));

  const areasCatalog = ["INSTALACIONES", "AVERIAS", "ADMIN_COMUNICADOS"];

  return (
    <ComunicadoCreateFormClient
      rolesCatalog={rolesCatalog}
      areasCatalog={areasCatalog}
      backHref="/admin/comunicados"
    />
  );
}
