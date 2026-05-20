import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { getTemporalPublicPage } from "@/domain/temporalPublic/repo";
import LocalTime from "@/ui/LocalTime";
import { saveTemporalPublicPageAction } from "./actions";

function textareaClassName() {
  return "min-h-[132px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800";
}

function inputClassName() {
  return "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800";
}

export const dynamic = "force-dynamic";

export default async function AdminTemporalPage() {
  await requireAdmin();
  const page = await getTemporalPublicPage();

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Publicacion externa
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Pagina temporal publica
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Controla el contenido de <code>/temporal</code> sin tocar el login ni las rutas protegidas.
              Cuando esta apagada, la ruta publica devuelve 404.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                page.active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
              }`}
            >
              {page.active ? "Activa" : "Inactiva"}
            </span>
            <Link
              href="/temporal"
              target="_blank"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Ver pagina publica
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Estado</div>
            <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
              {page.active ? "Publicada" : "Oculta"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Ultima edicion</div>
            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-50">
              {page.updatedAt ? <LocalTime dateMs={new Date(page.updatedAt).getTime()} /> : "Sin cambios guardados"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Actualizado por</div>
            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-50">
              {page.updatedBy || "No registrado"}
            </div>
          </div>
        </div>
      </section>

      <form action={saveTemporalPublicPageAction} className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Publicacion</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Activa o desactiva la pagina publica sin alterar ninguna otra ruta.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
              <input
                name="active"
                type="checkbox"
                defaultChecked={page.active}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              Habilitar pagina publica
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Etiqueta superior</span>
              <input name="eyebrow" defaultValue={page.eyebrow} className={inputClassName()} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Titulo principal</span>
              <input name="title" defaultValue={page.title} className={inputClassName()} />
            </label>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Resumen</span>
            <textarea name="summary" defaultValue={page.summary} className={textareaClassName()} />
          </label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Bloque principal</span>
                <input name="primaryTitle" defaultValue={page.primaryTitle} className={inputClassName()} />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Contenido principal</span>
                <textarea name="primaryBody" defaultValue={page.primaryBody} className={textareaClassName()} />
              </label>
            </div>

            <div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Bloque secundario</span>
                <input name="secondaryTitle" defaultValue={page.secondaryTitle} className={inputClassName()} />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Contenido secundario</span>
                <textarea name="secondaryBody" defaultValue={page.secondaryBody} className={textareaClassName()} />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Llamado a la accion opcional</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Si dejas ambos campos vacios, la pagina no mostrara boton.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Texto del boton</span>
              <input name="ctaLabel" defaultValue={page.ctaLabel} className={inputClassName()} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">Enlace del boton</span>
              <input
                name="ctaHref"
                defaultValue={page.ctaHref}
                placeholder="https://..."
                className={inputClassName()}
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Embed opcional</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Si pegas un <code>iframe</code>, la pagina publica priorizara ese contenido y ocultara el boton.
          </p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-medium text-slate-800 dark:text-slate-100">
              Codigo iframe
            </span>
            <textarea
              name="embedCode"
              defaultValue={page.embedCode}
              placeholder='<iframe title="Dashboard" width="1140" height="541.25" src="https://app.powerbi.com/reportEmbed?..." frameborder="0" allowFullScreen="true"></iframe>'
              className={textareaClassName()}
            />
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Guardar pagina temporal
          </button>
        </div>
      </form>
    </div>
  );
}
