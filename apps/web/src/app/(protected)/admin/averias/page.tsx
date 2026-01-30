import { requireArea } from "@/core/auth/guards";

export default async function AveriasPage() {
  await requireArea("AVERIAS");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Averías</h1>
      <p className="text-sm opacity-80">
        Página protegida por área: <b>AVERIAS</b>.
      </p>
    </div>
  );
}
