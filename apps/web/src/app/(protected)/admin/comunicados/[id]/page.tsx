import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { listRoles } from "@/domain/roles/repo";
import { getComunicadoById } from "@/domain/comunicados/repo";
import ComunicadoForm from "@/ui/admin/comunicados/ComunicadoForm";
import { comunicadosToggleByIdAction, comunicadosUpdateFromFormAction } from "../actions";

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
    persistencia: (c?.persistencia === "ALWAYS" ? "ALWAYS" : "ONCE") as "ALWAYS" | "ONCE",
  };
}

export default async function ComunicadoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERM);
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
  const areasCatalog = ["INSTALACIONES", "MANTENIMIENTO", "ADMIN_COMUNICADOS"];
  const defaults = toPlainDefaults(c);

  return (
    <div className="p-6">
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
          headerSubtitle="Actualiza contenido, audiencia y vigencia del comunicado."
          backHref="/admin/comunicados"
          rolesCatalog={rolesCatalog}
          areasCatalog={areasCatalog}
          defaultValues={defaults}
        />
      </form>

      <form
        className="mt-3"
        action={async () => {
          "use server";
          await comunicadosToggleByIdAction(id);
          redirect(`/admin/comunicados/${id}`);
        }}
      >
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          type="submit"
        >
          {defaults.estado === "ACTIVO" ? "Desactivar comunicado" : "Activar comunicado"}
        </button>
      </form>
    </div>
  );
}
