import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import HomeSidebar from "@/ui/home/Sidebar";
import HomeTopbar from "@/ui/home/Topbar";

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  if (session.isAdmin) redirect("/admin");

  return (
    <div className="min-h-dvh grid grid-cols-[240px_1fr]">
      <aside className="border-r p-4">
        <HomeSidebar session={session} />
      </aside>

      <div className="min-w-0">
        <div className="border-b p-4">
          <HomeTopbar session={session} />
        </div>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
