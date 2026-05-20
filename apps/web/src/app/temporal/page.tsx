import Link from "next/link";
import { getTemporalPublicPage } from "@/domain/temporalPublic/repo";

export const dynamic = "force-dynamic";

function paragraphize(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractIframeAttr(code: string, attr: string) {
  const rx = new RegExp(`${attr}="([^"]+)"`, "i");
  return code.match(rx)?.[1]?.trim() || "";
}

function parseIframe(code: string) {
  const normalized = code.trim();
  if (!normalized.toLowerCase().includes("<iframe")) return null;

  const src = extractIframeAttr(normalized, "src");
  if (!src) return null;

  const title = extractIframeAttr(normalized, "title") || "Contenido embebido";
  const width = extractIframeAttr(normalized, "width") || "100%";

  return {
    src,
    title,
    width,
  };
}

export default async function TemporalPublicPage() {
  const page = await getTemporalPublicPage();

  if (!page.active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,23,42,.08),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-10">
        <section className="max-w-2xl rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,.10)] backdrop-blur">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            REDES
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Por el momento no hay contenido disponible
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
            Esta pagina temporal se encuentra desactivada en este momento. Si necesitas acceder a
            informacion compartida, solicita un nuevo enlace o vuelve a intentarlo mas tarde.
          </p>
        </section>
      </main>
    );
  }

  const primaryParagraphs = paragraphize(page.primaryBody);
  const secondaryParagraphs = paragraphize(page.secondaryBody);
  const embed = parseIframe(page.embedCode);
  const hasCta = !embed && page.ctaLabel && page.ctaHref;

  if (embed) {
    return (
      <main className="h-screen w-screen overflow-hidden bg-white">
        <iframe
          title={embed.title}
          src={embed.src}
          width={embed.width}
          className="block h-screen w-screen"
          frameBorder="0"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,.08),_transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_42%,#ffffff_100%)] px-4 py-8 text-slate-900 md:px-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/90 shadow-[0_30px_80px_rgba(15,23,42,.12)] backdrop-blur">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
            <div className="p-8 md:p-12">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                {page.eyebrow}
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                {page.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                {page.summary}
              </p>
              {hasCta ? (
                <div className="mt-8">
                  <Link
                    href={page.ctaHref}
                    className="inline-flex items-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {page.ctaLabel}
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="relative overflow-hidden border-t border-slate-200 bg-slate-950 text-white lg:border-l lg:border-t-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(96,165,250,.35),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(34,197,94,.22),_transparent_28%)]" />
              <div className="relative flex h-full flex-col justify-between p-8 md:p-10">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">
                    Acceso publico
                  </div>
                  <div className="mt-4 text-2xl font-semibold tracking-tight">
                    Enlace directo, sin inicio de sesion
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    Esta ruta fue preparada para compartir informacion puntual sin exponer modulos
                    internos, datos protegidos ni permisos del sistema.
                  </p>
                </div>

                <div className="mt-10 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Disponibilidad</div>
                    <div className="mt-2 text-lg font-medium">Controlada desde administracion</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Seguridad</div>
                    <div className="mt-2 text-lg font-medium">Sin acceso a informacion interna</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,.06)]">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Bloque principal</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{page.primaryTitle}</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 md:text-base">
              {primaryParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 shadow-[0_20px_50px_rgba(15,23,42,.05)]">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Bloque complementario</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{page.secondaryTitle}</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 md:text-base">
              {secondaryParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
