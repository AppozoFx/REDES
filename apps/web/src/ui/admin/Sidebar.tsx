import { buildAdminNav } from "@/core/rbac/buildAdminNav";
import AdminSidebarClient from "@/ui/admin/SidebarClient";

export async function AdminSidebar({
  isAdmin,
  areas,
}: {
  isAdmin: boolean;
  areas: string[];
}) {
  const items = await buildAdminNav({ isAdmin, areas });
  return <AdminSidebarClient items={items} areas={areas} />;
}

