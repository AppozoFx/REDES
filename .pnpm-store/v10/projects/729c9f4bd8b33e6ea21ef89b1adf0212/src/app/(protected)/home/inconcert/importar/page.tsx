import { requirePermission } from "@/core/auth/guards";
import ImportarInconcertClient from "./ImportarInconcertClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("INCONCERT_IMPORT");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">InConcert - Importar CSV</h1>
      <ImportarInconcertClient />
    </div>
  );
}

