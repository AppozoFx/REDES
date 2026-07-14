import { requireAuth } from "@/core/auth/guards";
import { getStatusBoard } from "@/domain/presencia/statusBoard";
import { StatusBoard } from "@/ui/home/status/StatusBoard";

export const dynamic = "force-dynamic";

export default async function StatusHomePage() {
  await requireAuth();
  const board = await getStatusBoard();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sala de estado</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Quién está conectado ahora mismo, agrupado por rol. Se actualiza sola cada 10 segundos.
        </p>
      </div>
      <StatusBoard initial={board} />
    </div>
  );
}
