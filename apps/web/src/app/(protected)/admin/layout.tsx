import { ReactNode } from "react";
import { requireAdmin } from "@/core/auth/guards";
import { AdminSidebar } from "@/ui/admin/Sidebar";
import { AdminTopbar } from "@/ui/admin/Topbar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen flex">
      <AdminSidebar isAdmin={session.isAdmin} areas={session.access.areas} />

      <div className="flex-1">
        <AdminTopbar uid={session.uid} roles={session.access.roles} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
