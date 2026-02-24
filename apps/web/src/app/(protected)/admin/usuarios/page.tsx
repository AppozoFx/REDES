import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";

export default async function UsuariosListPage() {
  await requireAdmin();

  const rows = await listUsuariosAccess(50);

  // 1) Perfiles en batch desde Firestore
  const refs = rows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, (s.data() as any) ?? null]));

  // 2) Email final por UID (Firestore primero; fallback a Auth solo si falta)
  const emailByUid = new Map<string, string | null>();

  // primero: lo que venga de Firestore
  for (const r of rows) {
    const p = profileByUid.get(r.uid);
    const email = p?.email ?? null;
    emailByUid.set(r.uid, email);
  }

  // fallback: solo para los que no tienen email
  const missing = rows.filter((r) => !emailByUid.get(r.uid));

  // OJO: Auth no tiene batch. Limitamos para no hacer 50 llamadas si algún día crece.
  const MAX_AUTH_LOOKUPS = 10;
  for (const r of missing.slice(0, MAX_AUTH_LOOKUPS)) {
    try {
      const u = await adminAuth().getUser(r.uid);
      emailByUid.set(r.uid, u.email ?? null);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Link className="rounded border px-3 py-2 hover:bg-black/5" href="/admin/usuarios/new">
          Nuevo usuario
        </Link>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Roles</th>
              <th className="p-2 text-left">Áreas</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Acción</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-t">
                <td className="p-2">{emailByUid.get(r.uid) ?? "-"}</td>
                <td className="p-2">{(r.roles ?? []).join(", ")}</td>
                <td className="p-2">{(r.areas ?? []).join(", ")}</td>
                <td className="p-2">{r.estadoAcceso}</td>
                <td className="p-2">
                  <Link className="underline" href={`/admin/usuarios/${r.uid}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td className="p-4 opacity-70" colSpan={5}>
                  No hay usuarios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {missing.length > 10 && (
          <div className="p-3 text-xs opacity-70 border-t">
            Nota: se muestran emails de Auth solo para los primeros {MAX_AUTH_LOOKUPS} usuarios sin perfil.
            (Recomendación: crear/sincronizar perfiles para todos.)
          </div>
        )}
      </div>
    </div>
  );
}
