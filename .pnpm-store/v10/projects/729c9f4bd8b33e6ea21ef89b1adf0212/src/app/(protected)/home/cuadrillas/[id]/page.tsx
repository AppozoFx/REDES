import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { disableCuadrillaAction, enableCuadrillaAction, updateCuadrillaAction } from "../actions";
import ConductorAndCargosEdit from "./ConductorAndCargosEdit.client";

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

function tsToYmd(v: any): string {
  if (!v) return "";
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function CuadrillaDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("CUADRILLAS_MANAGE");
  const { id } = await props.params;
  if (!id) return notFound();

  const doc = await adminDb().collection("cuadrillas").doc(id).get();
  if (!doc.exists) return notFound();
  const c = doc.data() as any;

  async function fetchAssignedTecnicosUidsExcept(currentId: string): Promise<Set<string>> {
    const qs = await adminDb().collection("cuadrillas").get();
    const set = new Set<string>();
    qs.docs.forEach((d) => {
      if (d.id === currentId) return;
      const arr = (d.data() as any)?.tecnicosUids as string[] | undefined;
      if (Array.isArray(arr)) arr.forEach((u) => set.add(u));
    });
    return set;
  }

  const [tecnicosAll, coordinadores, gestores, assignedSet] = await Promise.all([
    fetchUsersByRole("TECNICO"),
    fetchUsersByRole("COORDINADOR"),
    fetchUsersByRole("GESTOR"),
    fetchAssignedTecnicosUidsExcept(id),
  ]);

  const tecnicosSelected: string[] = Array.isArray(c.tecnicosUids) ? c.tecnicosUids : [];
  const tecnicos = tecnicosAll.filter((u) => !assignedSet.has(u.uid) || tecnicosSelected.includes(u.uid));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Cuadrilla: {id}</h1>

      <div className="rounded border p-4 text-sm space-y-1">
        <div><b>Área:</b> {c.area}</div>
        <div><b>Categoría:</b> {c.categoria}</div>
        <div><b>N°:</b> {c.numeroCuadrilla}</div>
        <div><b>Nombre:</b> {c.nombre}</div>
        <div><b>Zona:</b> {c.zonaId}</div>
        <div><b>Tipo zona:</b> {c.tipoZona}</div>
        <div><b>Vehículo:</b> {c.vehiculo}</div>
      </div>

      <form
        key={`${c.estado}|${c.placa}|${(c.tecnicosUids ?? []).join(',')}|${c.coordinadorUid}|${c.gestorUid}|${c.conductorUid}|${tsToYmd(c.licenciaVenceAt)}|${tsToYmd(c.soatVenceAt)}|${tsToYmd(c.revTecVenceAt)}`}
        action={async (formData) => {
          "use server";
          await updateCuadrillaAction(id, formData);
        }}
        className="space-y-4 rounded border p-4"
      >
        <h2 className="font-medium">Editar</h2>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm">Placa</label>
            <input name="placa" defaultValue={c.placa ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Estado</label>
            <select name="estado" className="w-full border rounded px-3 py-2" defaultValue={c.estado}>
              <option value="HABILITADO">HABILITADO</option>
              <option value="INHABILITADO">INHABILITADO</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Técnicos</label>
            <select name="tecnicosUids" multiple className="w-full border rounded px-3 py-2 h-40" defaultValue={tecnicosSelected}>
              {tecnicos.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

  <ConductorAndCargosEdit
            tecnicos={tecnicos}
            tecnicosSelected={tecnicosSelected}
            coordinadores={coordinadores}
            gestores={gestores}
            current={{ conductorUid: c.conductorUid, coordinadorUid: c.coordinadorUid, gestorUid: c.gestorUid }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm">Licencia (número)</label>
            <input name="licenciaNumero" defaultValue={c.licenciaNumero ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Licencia vence</label>
            <input name="licenciaVenceAt" type="date" defaultValue={tsToYmd(c.licenciaVenceAt)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">SOAT vence</label>
            <input name="soatVenceAt" type="date" defaultValue={tsToYmd(c.soatVenceAt)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Rev. técnica vence</label>
            <input name="revTecVenceAt" type="date" defaultValue={tsToYmd(c.revTecVenceAt)} className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Credencial usuario (opcional)</label>
            <input name="credUsuario" defaultValue={c.credUsuario ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Credencial password (opcional)</label>
            <input name="credPassword" type="password" defaultValue={c.credPassword ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Modelo (opcional)</label>
            <input name="vehiculoModelo" defaultValue={c.vehiculoModelo ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Marca (opcional)</label>
            <input name="vehiculoMarca" defaultValue={c.vehiculoMarca ?? ""} className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Guardar cambios</button>
      </form>

      {c.estado === "HABILITADO" ? (
        <form
          action={async () => {
            "use server";
            await disableCuadrillaAction(id);
          }}
          className="rounded border border-red-300 p-4 space-y-3"
        >
          <div className="font-medium text-red-700">Inhabilitar cuadrilla</div>
          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">Inhabilitar</button>
        </form>
      ) : (
        <form
          action={async () => {
            "use server";
            await enableCuadrillaAction(id);
          }}
          className="rounded border border-yellow-400 p-4"
        >
          <div className="text-sm mb-3">Esta cuadrilla está <b>INHABILITADA</b>.</div>
          <button className="rounded border px-3 py-2 hover:bg-black/5">Habilitar</button>
        </form>
      )}
    </div>
  );
}

// client subcomponent moved to separate file
