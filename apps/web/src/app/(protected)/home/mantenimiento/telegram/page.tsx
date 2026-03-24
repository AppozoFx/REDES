import { requireArea } from "@/core/auth/guards";
import TelegramMantenimientoIngresosClient from "./TelegramMantenimientoIngresosClient";

export default async function TelegramMantenimientoIngresosPage() {
  await requireArea("MANTENIMIENTO");
  return <TelegramMantenimientoIngresosClient />;
}
