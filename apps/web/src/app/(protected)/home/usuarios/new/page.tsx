import { requireAuth, requirePermission } from "@/core/auth/guards";
import { listRoles } from "@/domain/roles/repo";
import UserCreateForm from "@/ui/home/usuarios/UserCreateForm";

export default async function HomeUsuariosNewPage() {
  await requireAuth();
  await requirePermission("USERS_CREATE");

  const roles = await listRoles(200); // all roles
  
  


  const rolesAllowed = roles
    .filter((r: any) => r.id !== "ADMIN" && (r.estado ?? "ACTIVO") === "ACTIVO")
    .map((r: any) => ({ id: r.id, nombre: r.nombre ?? r.id }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Crear usuario</h1>
        <p className="text-sm text-muted-foreground">
          Se crea en Auth + usuarios + usuarios_access. Fechas se guardan como Timestamp (hora local).
        </p>
      </div>

      <UserCreateForm rolesAllowed={rolesAllowed} />
    </div>
  );
}
