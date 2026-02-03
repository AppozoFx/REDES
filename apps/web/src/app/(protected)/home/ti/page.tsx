import { requireAuth } from "@/core/auth/guards";

export default async function TecnicoHome() {
  const session = await requireAuth();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Inicio TI</h1>
      <p className="text-sm text-muted-foreground">uid: {session.uid}</p>
    </div>
  );
}
