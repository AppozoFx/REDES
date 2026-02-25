import { requireArea } from "@/core/auth/guards";

export default async function InstalacionesPage() {
  await requireArea("INSTALACIONES");

  return (
    <div className="space-y-2 text-slate-900 dark:text-slate-100">
      <h1 className="text-2xl font-semibold">Instalaciones</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        PÃ¡gina protegida por Ã¡rea: <b>INSTALACIONES</b>.
      </p>
    </div>
  );
}
