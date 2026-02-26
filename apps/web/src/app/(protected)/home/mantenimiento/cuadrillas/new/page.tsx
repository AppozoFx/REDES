import { requireArea, requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import CuadrillaMantCreateForm from "./CuadrillaMantCreateForm.client";

type UserOpt = { uid: string; label: string };

async function fetchUsersByRole(role: string, allowedAreas: string[]): Promise<UserOpt[]> {
  const qs = await adminDb().collection("usuarios_access").where("roles", "array-contains", role).get();
  const rows = qs.docs
    .map((d) => ({ uid: d.id, ...(d.data() as any) }))
    .filter((r) => {
      const areas = Array.isArray(r.areas) ? r.areas : [];
      return areas.some((a: string) => allowedAreas.includes(String(a || "").toUpperCase()));
    });

  const refs = rows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, s.exists ? (s.data() as any) : {}]));

  const shortName = (full: string, fallback: string) => {
    const parts = String(full || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const first = parts[0] || "";
    const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
    return `${first} ${firstLast}`.trim() || fallback;
  };

  return rows.map((r) => {
    const p = profileByUid.get(r.uid) ?? {};
    const nombres = String(p.nombres || "").trim();
    const apellidos = String(p.apellidos || "").trim();
    const full = p.displayName || `${nombres} ${apellidos}`.trim() || r.uid;
    const label = shortName(full, r.uid);
    return { uid: r.uid, label: `${label} (${r.uid})` };
  });
}

async function fetchAssignedTecnicosUidsMantenimiento(): Promise<Set<string>> {
  const qs = await adminDb().collection("cuadrillas").where("area", "==", "MANTENIMIENTO").get();
  const set = new Set<string>();
  qs.docs.forEach((d) => {
    const arr = (d.data() as any)?.tecnicosUids as string[] | undefined;
    if (Array.isArray(arr)) arr.forEach((u) => set.add(u));
  });
  return set;
}

export default async function NuevaCuadrillaMantenimientoPage() {
  await requireArea("MANTENIMIENTO");
  await requirePermission("CUADRILLAS_MANAGE");

  const allowedAreas = ["MANTENIMIENTO"];
  const [tecnicosAll, coordinadores, gestores, assignedSet] = await Promise.all([
    fetchUsersByRole("TECNICO", allowedAreas),
    fetchUsersByRole("COORDINADOR", allowedAreas),
    fetchUsersByRole("GESTOR", allowedAreas),
    fetchAssignedTecnicosUidsMantenimiento(),
  ]);

  const tecnicos = tecnicosAll.filter((u) => !assignedSet.has(u.uid));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Nueva cuadrilla (Mantenimiento)</h1>
      <CuadrillaMantCreateForm tecnicos={tecnicos} coordinadores={coordinadores} gestores={gestores} />
    </div>
  );
}
