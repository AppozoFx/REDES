import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { listComunicados } from "@/domain/comunicados/repo";
import LocalTime from "@/ui/LocalTime";
import { comunicadosToggleAction } from "./actions";

const PERM = "ANNOUNCEMENTS_MANAGE";

function toMillis(ts: any): number | null {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    return d ? d.getTime() : null;
  } catch {
    return null;
  }
}

export default async function ComunicadosAdminListPage() {
  await requirePermission(PERM);

  const rows = await listComunicados(80);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Comunicados</h1>
          <p className="text-sm text-muted-foreground">
            Administra comunicados (texto, link, targeting, obligatorio).
          </p>
        </div>

        <Link className="rounded-lg border px-3 py-2 text-sm" href="/admin/comunicados/new">
          Nuevo comunicado
        </Link>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Título</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Target</th>
              <th className="p-3">Oblig.</th>
              <th className="p-3">Prioridad</th>
              <th className="p-3">Creado</th>
              <th className="p-3 w-[260px]">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((c: any) => {
              // ✅ variables planas (evita closures con Timestamp/audit)
              const id = String(c?.id ?? "").trim();
              const estado = c?.estado === "ACTIVO" ? "ACTIVO" : "INACTIVO";
              const nextEstado = estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

              return (
                <tr key={id || String(c.titulo)} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{c.titulo}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {String(c.cuerpo ?? "").slice(0, 120)}
                    </div>
                  </td>

                  <td className="p-3">
                    <span className="rounded-md border px-2 py-0.5 text-xs">
                      {estado}
                    </span>
                  </td>

                  <td className="p-3">
                    <span className="rounded-md border px-2 py-0.5 text-xs">
                      {c.target ?? "ALL"}
                    </span>
                  </td>

                  <td className="p-3">{c.obligatorio ? "Sí" : "No"}</td>
                  <td className="p-3">{typeof c.prioridad === "number" ? c.prioridad : 100}</td>
                  <td className="p-3">
                    <LocalTime dateMs={toMillis(c.audit?.createdAt)} />
                  </td>

                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="rounded-lg border px-3 py-1.5 text-sm"
                        href={id ? `/admin/comunicados/${id}` : "/admin/comunicados"}
                      >
                        Editar
                      </Link>

                      <form
                        action={async () => {
                          "use server";
                          if (!id) return;
                          await comunicadosToggleAction(id, { estado: nextEstado });
                        }}
                      >
                        <button className="rounded-lg border px-3 py-1.5 text-sm" type="submit">
                          {estado === "ACTIVO" ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!rows.length ? (
              <tr>
                <td className="p-6 text-sm text-muted-foreground" colSpan={7}>
                  No hay comunicados aún.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
