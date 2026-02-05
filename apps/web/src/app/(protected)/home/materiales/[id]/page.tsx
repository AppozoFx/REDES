import { requirePermission } from "@/core/auth/guards";
import EditClient from "./EditClient";
import { getMaterialAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  await requirePermission("MATERIALES_EDIT");
  const res = await getMaterialAction(params.id);
  if (!res.ok) {
    return <div className="text-sm text-red-700">Material no encontrado</div> as any;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar material: {res.doc.id}</h1>
      <EditClient initial={res.doc as any} />
    </div>
  );
}
