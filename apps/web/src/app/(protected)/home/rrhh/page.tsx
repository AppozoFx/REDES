import { requireAuth } from "@/core/auth/guards";

export default async function TecnicoHome() {
  await requireAuth();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Inicio RRHH</h1>
    </div>
  );
}
