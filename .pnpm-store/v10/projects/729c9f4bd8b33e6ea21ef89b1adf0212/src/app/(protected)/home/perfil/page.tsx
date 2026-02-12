import { requireAuth } from "@/core/auth/guards";
import { getUsuarioProfileByUid } from "@/domain/usuarios/repo";
import PerfilForm from "@/ui/home/perfil/PerfilForm";

export default async function PerfilPage() {
  const session = await requireAuth();
  const profile = await getUsuarioProfileByUid(session.uid);

  const defaults = {
    celular: (profile?.celular as string) ?? "",
    direccion: (profile?.direccion as string) ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">
          Actualiza tus datos de contacto.
        </p>
      </div>

      <PerfilForm defaults={defaults} />
    </div>
  );
}
