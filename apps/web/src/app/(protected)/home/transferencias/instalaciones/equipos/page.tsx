import { adminDb } from "@/lib/firebase/admin";
import { requirePermission } from "@/core/auth/guards";
import EquiposClient from "./ui/EquiposClient";

function toPlain(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    if (typeof (value as any)?.toDate === "function") {
      try {
        return (value as any).toDate().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("EQUIPOS_VIEW");
  const canEdit = session.isAdmin || session.permissions.includes("EQUIPOS_EDIT");

  const [equiposSnap, cuadrillasSnap] = await Promise.all([
    adminDb().collection("equipos").get(),
    adminDb().collection("cuadrillas").where("area", "==", "INSTALACIONES").get(),
  ]);

  const equipos = equiposSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
  const cuadrillas = cuadrillasSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Equipos - Instalaciones</h1>
      <EquiposClient initialEquipos={equipos} initialCuadrillas={cuadrillas} canEdit={canEdit} />
    </div>
  );
}
