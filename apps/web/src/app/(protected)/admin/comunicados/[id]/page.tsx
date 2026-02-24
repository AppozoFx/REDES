import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { listRoles } from "@/domain/roles/repo";
import { getComunicadoById } from "@/domain/comunicados/repo";
import ComunicadoForm from "@/ui/admin/comunicados/ComunicadoForm";
import { comunicadosUpdateFromFormAction, comunicadosToggleByIdAction } from "../actions";

const PERM = "ANNOUNCEMENTS_MANAGE";

type FormDefaults = {
  titulo: string;
  cuerpo: string;
  imageUrl: string;
  linkUrl: string;
  linkLabel: string;
  estado: "ACTIVO" | "INACTIVO";
  target: "ALL" | "ROLES" | "AREAS" | "USERS";
  rolesTarget: string[];
  areasTarget: string[];
  uidsTarget: string[];
  visibleDesde: string;
  visibleHasta: string;
  prioridad: number;
  obligatorio: boolean;
  persistencia: "ONCE" | "ALWAYS";
};

function tsToYmd(ts: any): string {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function toPlainDefaults(c: any): FormDefaults {
  const currentEstado = c?.estado === "INACTIVO" ? "INACTIVO" : "ACTIVO";
  const target = ["ALL", "ROLES", "AREAS", "USERS"].includes(c?.target) ? c.target : "ALL";

  return {
    titulo: String(c?.titulo ?? ""),
    cuerpo: String(c?.cuerpo ?? ""),

    imageUrl: String(c?.imageUrl ?? ""),
    linkUrl: String(c?.linkUrl ?? ""),
    linkLabel: String(c?.linkLabel ?? ""),

    estado: currentEstado as "ACTIVO" | "INACTIVO",
    target: target as "ALL" | "ROLES" | "AREAS" | "USERS",

    rolesTarget: (Array.isArray(c?.rolesTarget) ? c.rolesTarget.map((v: any) => String(v)) : []) as string[],
    areasTarget: (Array.isArray(c?.areasTarget) ? c.areasTarget.map((v: any) => String(v)) : []) as string[],
    uidsTarget: (Array.isArray(c?.uidsTarget) ? c.uidsTarget.map((v: any) => String(v)) : []) as string[],

    visibleDesde: tsToYmd(c?.visibleDesde),
    visibleHasta: tsToYmd(c?.visibleHasta),

    prioridad: typeof c?.prioridad === "number" ? c.prioridad : 100,
    obligatorio: !!c?.obligatorio,
    // incluir persistencia para que el select refleje el valor actual
    persistencia: (c?.persistencia === "ALWAYS" ? "ALWAYS" : "ONCE") as "ALWAYS" | "ONCE",
  };
}

export default async function ComunicadoEditPage({
  params,
}: {
  // ✅ en tu proyecto params está llegando como Promise, así que lo tipamos así
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERM);

  // ✅ obligatorio: “unwrap” de params
  const { id: rawId } = await params;

  const id = String(rawId ?? "").trim();
  if (!id) notFound();

  const c = await getComunicadoById(id);
  if (!c) notFound();

  const roles = await listRoles(100);
  const rolesCatalog = roles.map((r: any) => ({
    id: String(r.id),
    nombre: String(r.nombre ?? r.id),
  }));

  const areasCatalog = ["INSTALACIONES", "AVERIAS", "ADMIN_COMUNICADOS"];

  const defaults = toPlainDefaults(c);
  const currentEstado = defaults.estado;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Editar comunicado</h1>
          <p className="text-sm text-muted-foreground">Comunicado seleccionado</p>
        </div>

        <div className="flex gap-2">
          <Link className="rounded-lg border px-3 py-2 text-sm" href="/admin/comunicados">
            Volver
          </Link>

          <form
            action={async () => {
              "use server";
              await comunicadosToggleByIdAction(id);
              redirect(`/admin/comunicados/${id}`);
            }}
          >
            <button className="rounded-lg border px-3 py-2 text-sm" type="submit">
              {currentEstado === "ACTIVO" ? "Desactivar" : "Activar"}
            </button>
          </form>
        </div>
      </div>

      <form
        action={async (fd) => {
          "use server";
          await comunicadosUpdateFromFormAction(id, fd);
          redirect(`/admin/comunicados/${id}`);
        }}
      >
        <ComunicadoForm
          mode="edit"
          headerTitle="Editar comunicado"
          headerSubtitle="Edita el contenido y la audiencia"
          backHref="/admin/comunicados"
          rolesCatalog={rolesCatalog}
          areasCatalog={areasCatalog}
          defaultValues={defaults}
        />

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" type="submit">
            Guardar cambios
          </button>
          <Link className="rounded-lg border px-4 py-2 text-sm" href="/admin/comunicados">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
