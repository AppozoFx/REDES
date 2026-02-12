import { requirePermission } from "@/core/auth/guards";
import ListClient from "./ListClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("MATERIALES_VIEW");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materiales</h1>
        <a href="/home/materiales/crear" className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700">Crear</a>
      </div>
      <ListClient />
    </div>
  );
}
