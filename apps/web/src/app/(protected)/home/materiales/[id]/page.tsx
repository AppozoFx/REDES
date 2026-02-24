import { requirePermission } from "@/core/auth/guards";
import EditClient from "./EditClient";
import { getMaterialAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("MATERIALES_EDIT");
  const { id } = await params;
  const res = await getMaterialAction(id);
  if (!res.ok) {
    return <div className="text-sm text-red-700">Material no encontrado</div> as any;
  }
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Editar material</h1>
      </section>
      <EditClient initial={res.doc as any} />
    </div>
  );
}
