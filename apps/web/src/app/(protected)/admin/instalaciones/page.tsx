import { requireArea } from "@/core/auth/guards";
import AdminInstalacionesClient from "./AdminInstalacionesClient";

export default async function InstalacionesPage() {
  await requireArea("INSTALACIONES");
  return <AdminInstalacionesClient />;
}
