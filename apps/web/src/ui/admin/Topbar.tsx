"use client";

export function AdminTopbar({
  uid,
  roles,
}: {
  uid: string;
  roles: string[];
}) {
  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b px-6 py-3 flex items-center justify-between">
      <div className="text-sm opacity-80">
        <span className="font-medium">uid:</span> {uid} ·{" "}
        <span className="font-medium">roles:</span> {roles.join(", ") || "(none)"}
      </div>

      <button
        onClick={logout}
        className="rounded border px-3 py-1 text-sm hover:bg-black/5"
      >
        Cerrar sesión
      </button>
    </header>
  );
}
