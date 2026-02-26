import { redirect } from "next/navigation";
import { requireArea } from "@/core/auth/guards";

export default async function MantenimientoHomePage() {
  await requireArea("MANTENIMIENTO");
  redirect("/home/mantenimiento/cuadrillas");
}
