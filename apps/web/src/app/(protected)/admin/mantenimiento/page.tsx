import { requireArea } from "@/core/auth/guards";

export default async function MantenimientoPage() {
  await requireArea("MANTENIMIENTO");

  return (
    <div className="space-y-2 text-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-semibold">Mantenimiento</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Pagina protegida por area: <b>MANTENIMIENTO</b>.
      </p>
    </div>
  );
}



