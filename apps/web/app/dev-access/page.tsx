"use client";

import { auth } from "@/lib/firebaseClient";
import { useAccess } from "@/lib/useAccess";

export default function DevAccessPage() {
  const { loading, isAdmin, roles, areas } = useAccess();

  if (loading) return <p>Cargando...</p>;

  const uid = auth.currentUser?.uid ?? "(no user)";

  return (
    <div style={{ padding: 16 }}>
      <h1>Access Debug</h1>
      <p><b>uid:</b> {uid}</p>
      <p><b>isAdmin:</b> {String(isAdmin)}</p>
      <p><b>roles:</b> {JSON.stringify(roles)}</p>
      <p><b>areas:</b> {JSON.stringify(areas)}</p>
    </div>
  );
}
