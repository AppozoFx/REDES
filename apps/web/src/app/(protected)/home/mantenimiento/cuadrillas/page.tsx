import Link from "next/link";
import { requireArea, requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

export default async function CuadrillasMantenimientoPage() {
  await requireArea("MANTENIMIENTO");
  await requirePermission("CUADRILLAS_MANAGE");

  let rows: any[] = [];
  let indexError = false;
  try {
    const snap = await adminDb()
      .collection("cuadrillas")
      .where("area", "==", "MANTENIMIENTO")
      .orderBy("nombre", "asc")
      .get();
    rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e: any) {
    const message = String(e?.message || "");
    if (message.includes("FAILED_PRECONDITION") && message.toLowerCase().includes("index")) {
      indexError = true;
    } else {
      throw e;
    }
  }

  const uidSet = new Set<string>();
  rows.forEach((r) => {
    if (r.coordinadorUid) uidSet.add(String(r.coordinadorUid));
    const tecnicos = Array.isArray(r.tecnicosUids) ? r.tecnicosUids : [];
    tecnicos.forEach((u: any) => uidSet.add(String(u)));
  });

  const uidList = Array.from(uidSet);
  const userRefs = uidList.map((uid) => adminDb().collection("usuarios").doc(uid));
  const userSnaps = uidList.length ? await adminDb().getAll(...userRefs) : [];
  const userByUid = new Map(
    userSnaps.map((s) => {
      const data = s.exists ? (s.data() as any) : {};
      const nombres = String(data?.nombres || "").trim();
      const apellidos = String(data?.apellidos || "").trim();
      const full = data?.displayName || `${nombres} ${apellidos}`.trim() || s.id;
      return [s.id, shortName(full, s.id)];
    })
  );

  rows = rows.map((r) => {
    const tecnicos = Array.isArray(r.tecnicosUids) ? r.tecnicosUids : [];
    const tecnicosLabel = tecnicos
      .map((u: any) => userByUid.get(String(u)) || String(u))
      .filter(Boolean)
      .join(", ");
    return {
      ...r,
      coordinadorLabel: r.coordinadorUid ? userByUid.get(String(r.coordinadorUid)) || String(r.coordinadorUid) : "",
      tecnicosLabel,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuadrillas - Mantenimiento</h1>
        <Link
          className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          href="/home/mantenimiento/cuadrillas/new"
        >
          Nueva cuadrilla
        </Link>
      </div>

      {indexError ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Falta crear el índice compuesto para cuadrillas (area + nombre). Crea el índice en Firebase Console y
          vuelve a intentar.
        </div>
      ) : null}

      <div className="rounded border overflow-auto">
        <table className="min-w-[800px] text-sm">
          <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr className="text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Zona</th>
              <th className="p-2">Turno</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Coordinador</th>
              <th className="p-2">Tecnicos</th>
              <th className="p-2">Editar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2 font-medium">{r.nombre || r.id}</td>
                  <td className="p-2">{r.zona || "-"}</td>
                  <td className="p-2">{r.turno === "MANANA" ? "MAÑANA" : r.turno || "-"}</td>
                  <td className="p-2">{r.estado || "-"}</td>
                  <td className="p-2">{r.coordinadorLabel || r.coordinadorUid || "-"}</td>
                  <td className="p-2">{r.tecnicosLabel || "-"}</td>
                  <td className="p-2">
                    <Link className="text-blue-700 hover:underline" href={`/home/cuadrillas/${r.id}`}>
                      Editar
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-500">
                  No hay cuadrillas de mantenimiento todavia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
