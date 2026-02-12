"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireServerPermission } from "@/core/auth/require";
import { createZona, disableZona, enableZona, updateZona } from "@/domain/zonas/repo";

const PERM = "ZONAS_MANAGE";

function splitDistritos(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createZonaAction(formData: FormData) {
  const session = await requireServerPermission(PERM);

  const zona = String(formData.get("zona") ?? "").trim();
  const estado = String(formData.get("estado") ?? "HABILITADO").trim();
  const tipo = String(formData.get("tipo") ?? "REGULAR").trim();
  const distritos = splitDistritos(String(formData.get("distritos") ?? ""));

  try {
    const { id } = await createZona({ zona, estado, tipo, distritos }, session.uid);

    revalidatePath("/home/zonas");
    redirect(`/home/zonas/${id}`);
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    const msg = code === "ZONA_ID_CONFLICT" ? "Conflicto al crear zona, reintenta nuevamente." : code;
    return { ok: false as const, error: { formErrors: [msg] } };
  }
}

export async function updateZonaAction(id: string, formData: FormData) {
  const session = await requireServerPermission(PERM);

  const estado = String(formData.get("estado") ?? "").trim() || undefined;
  const tipo = String(formData.get("tipo") ?? "").trim() || undefined;
  const distritosRaw = String(formData.get("distritos") ?? "");
  const distritos = distritosRaw ? splitDistritos(distritosRaw) : undefined;

  try {
    await updateZona(id, { estado, tipo, distritos }, session.uid);

    revalidatePath("/home/zonas");
    revalidatePath(`/home/zonas/${id}`);
    redirect(`/home/zonas/${id}`);
  } catch (e: any) {
    const msg = e?.message ?? "ERROR";
    return { ok: false as const, error: { formErrors: [msg] } };
  }
}

export async function disableZonaAction(id: string) {
  const session = await requireServerPermission(PERM);
  try {
    await disableZona(id, session.uid);

    revalidatePath("/home/zonas");
    revalidatePath(`/home/zonas/${id}`);
    redirect(`/home/zonas/${id}`);
  } catch (e: any) {
    const msg = e?.message ?? "ERROR";
    return { ok: false as const, error: { formErrors: [msg] } };
  }
}

export async function enableZonaAction(id: string) {
  const session = await requireServerPermission(PERM);
  try {
    await enableZona(id, session.uid);

    revalidatePath("/home/zonas");
    revalidatePath(`/home/zonas/${id}`);
    redirect(`/home/zonas/${id}`);
  } catch (e: any) {
    const msg = e?.message ?? "ERROR";
    return { ok: false as const, error: { formErrors: [msg] } };
  }
}
