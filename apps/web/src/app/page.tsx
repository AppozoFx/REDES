import { redirect } from "next/navigation";
import { getServerSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getServerSession();
  if (!s) redirect("/login");
  if (s.isAdmin) redirect("/admin");
  redirect("/home");
}
