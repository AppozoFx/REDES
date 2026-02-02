import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { listPendingComunicadosForUser } from "@/domain/comunicados/service";
import { getHomeRouteForSession } from "@/core/rbac/homeRoute";
import { markSeenAction } from "./actions";

function getPersistencia(c: any): "ONCE" | "ALWAYS" {
  const p = String(c?.persistencia ?? "ONCE").toUpperCase();
  return p === "ALWAYS" ? "ALWAYS" : "ONCE";
}

export default async function ComunicadosGatePage() {
  const session = await requireAuth();
  if (session.isAdmin) redirect("/admin");

  const pending = await listPendingComunicadosForUser(session);

  // El Gate SOLO bloquea por comunicados obligatorios y persistencia=ONCE
  const blocking = pending.filter(
    (c: any) => !!c?.obligatorio && getPersistencia(c) === "ONCE"
  );

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Comunicados</h1>
        {blocking.length ? (
          <p className="text-sm text-muted-foreground">
            Debes revisar los comunicados obligatorios antes de continuar.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Estos son tus comunicados aplicables. Puedes continuar al inicio cuando quieras.
          </p>
        )}
      </div>

      {!pending.length ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">
          No hay comunicados aplicables.
        </div>
      ) : null}

      <div className="space-y-4">
        {pending.map((c: any) => {
          const id = String(c?.id ?? "").trim();
          if (!id) return null;

          return (
            <div key={id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="font-semibold">{String(c?.titulo ?? "")}</h2>

                  <div className="flex flex-wrap gap-2">
                    {c?.obligatorio ? (
                      <span className="text-xs rounded-md border px-2 py-0.5">Obligatorio</span>
                    ) : (
                      <span className="text-xs rounded-md border px-2 py-0.5">Opcional</span>
                    )}
                    <span className="text-xs rounded-md border px-2 py-0.5">
                      Persistencia: {getPersistencia(c)}
                    </span>
                    <span className="text-xs rounded-md border px-2 py-0.5">
                      Target: {String(c?.target ?? "ALL")}
                    </span>
                  </div>
                </div>
              </div>

              {c?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={String(c.imageUrl)}
                  alt=""
                  className="w-full rounded-lg border object-cover max-h-72"
                />
              ) : null}

              <div className="text-sm whitespace-pre-wrap">
                {String(c?.cuerpo ?? "")}
              </div>

              {c?.linkUrl ? (
                <a
                  className="text-sm underline"
                  href={String(c.linkUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {String(c?.linkLabel ?? "") || "Abrir enlace"}
                </a>
              ) : null}

              {/* ONCE: marcar leído lo ocultará; ALWAYS: seguirá apareciendo */}
              <form
                action={async () => {
                  "use server";
                  await markSeenAction(id);
                }}
              >
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  type="submit"
                >
                  Marcar como leído
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <div>
        <a
          className="inline-block rounded-lg border px-3 py-1.5 text-sm"
          href={getHomeRouteForSession(session)}
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}

