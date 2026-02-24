import RecepcionActasClient from "./ui/RecepcionActasClient";

export default function RecepcionActasPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Recepcion de Actas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registra actas recepcionadas por coordinador y opcionalmente por cuadrilla.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <RecepcionActasClient />
      </section>
    </div>
  );
}