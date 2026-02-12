"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { markComunicadoSeen } from "@/domain/comunicados/service";

export async function markSeenAction(comunicadoId: string) {
  const session = await requireAuth();
  await markComunicadoSeen(session.uid, comunicadoId);
  revalidatePath("/home/comunicados");
  revalidatePath("/home");
  redirect("/home/comunicados");
}
