import { requireAuth } from "@/core/auth/guards";
import InstalacionesClient from "./InstalacionesClient";

export default async function InstalacionesPage() {
  await requireAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Instalaciones</h1>
        <p className="text-sm text-muted-foreground">
          Control y seguimiento de instalaciones liquidadas por codigo de cliente.
        </p>
      </div>
      <InstalacionesClient />
    </div>
  );
}
