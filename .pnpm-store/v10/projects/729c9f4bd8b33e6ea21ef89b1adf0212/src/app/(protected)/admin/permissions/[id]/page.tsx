import { requireAdmin } from "@/core/auth/guards";
import { getPermissionById } from "@/domain/permissions/permissions.repo";
import { notFound } from "next/navigation";
import { PermissionEditForm } from "@/ui/admin/permissions/PermissionEditForm";
import { toPlain } from "@/lib/toPlain";

export default async function PermissionDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await props.params;

  const permission = await getPermissionById(id);
  if (!permission) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold font-mono">{id}</h1>
      <PermissionEditForm permission={toPlain(permission)} />
    </div>
  );
}
