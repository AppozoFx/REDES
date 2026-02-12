import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import CuadrillaCreateForm from "./CuadrillaCreateForm.client";

async function fetchZonasHabilitadas() {
  const qs = await adminDb().collection("zonas").where("estado", "==", "HABILITADO").get();
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

async function fetchUsersByRole(role: string) {
  const qs = await adminDb().collection("usuarios_access").where("roles", "array-contains", role).get();
  const rows = qs.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
  const refs = rows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, s.exists ? (s.data() as any) : {}]));
  return rows.map((r) => {
    const p = profileByUid.get(r.uid) ?? {};
    const dn = p.displayName || `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || r.uid;
    return { uid: r.uid, label: `${dn} (${r.uid})` };
  });
}

export default async function NuevaCuadrillaPage() {
  await requirePermission("CUADRILLAS_MANAGE");

  async function fetchAssignedTecnicosUids(): Promise<Set<string>> {
    const qs = await adminDb().collection("cuadrillas").get();
    const set = new Set<string>();
    qs.docs.forEach((d) => {
      const arr = (d.data() as any)?.tecnicosUids as string[] | undefined;
      if (Array.isArray(arr)) arr.forEach((u) => set.add(u));
    });
    return set;
  }

  const [zonas, tecnicosAll, coordinadores, gestores, assignedSet] = await Promise.all([
    fetchZonasHabilitadas(),
    fetchUsersByRole("TECNICO"),
    fetchUsersByRole("COORDINADOR"),
    fetchUsersByRole("GESTOR"),
    fetchAssignedTecnicosUids(),
  ]);
  const zonasSlim = zonas.map((z: any) => ({ id: z.id, tipo: z.tipo }));
  const tecnicos = tecnicosAll.filter((u: any) => !assignedSet.has(u.uid));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Nueva cuadrilla</h1>
      <CuadrillaCreateForm zonas={zonasSlim} tecnicos={tecnicos} coordinadores={coordinadores} gestores={gestores} />
    </div>
  );
}
