import { requireArea } from "@/core/auth/guards";

export default async function InstalacionesPage() {
  await requireArea("INSTALACIONES");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Instalaciones</h1>
      <p className="text-sm opacity-80">
        Página protegida por área: <b>INSTALACIONES</b>.
      </p>
    </div>
  );
}
