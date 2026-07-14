import { requireAuth } from "@/core/auth/guards";
import { getStatusBoard } from "@/domain/presencia/statusBoard";
import { StatusBoard } from "@/ui/home/status/StatusBoard";

export const dynamic = "force-dynamic";

export default async function StatusHomePage() {
  await requireAuth();
  const board = await getStatusBoard();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sala de estado</h1>
      <StatusBoard initial={board} />
    </div>
  );
}
