import { ReactNode } from "react";
import { requireAdmin } from "@/core/auth/guards";
import { AdminSidebar } from "@/ui/admin/Sidebar";
import AdminTopbar from "@/ui/admin/Topbar";
import { NotificationsRealtime } from "@/ui/common/NotificationsRealtime";
import RouteProgressBar from "@/ui/common/RouteProgressBar";
import TabSessionGuard from "@/ui/common/TabSessionGuard";
import UserPresenceHeartbeat from "@/ui/common/UserPresenceHeartbeat";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="flex h-dvh overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <AdminSidebar isAdmin={session.isAdmin} areas={session.access.areas} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <RouteProgressBar />
        <TabSessionGuard />
        <UserPresenceHeartbeat />
        <div className="sticky top-0 z-[140] border-b border-slate-200/70 bg-white/70 px-3 py-2 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/75">
          <AdminTopbar uid={session.uid} />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2 md:p-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-[0_10px_30px_rgba(15,23,42,.06)] md:p-4 dark:border-slate-700/80 dark:bg-slate-900/90 dark:shadow-none">
            {children}
          </div>
        </main>
        <NotificationsRealtime />
      </div>
    </div>
  );
}
