"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/core/auth/guards";
import { saveTemporalPublicPage } from "@/domain/temporalPublic/repo";

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveTemporalPublicPageAction(formData: FormData) {
  const session = await requireAdmin();

  await saveTemporalPublicPage(
    {
      active: formData.get("active") === "on",
      eyebrow: readText(formData, "eyebrow"),
      title: readText(formData, "title"),
      summary: readText(formData, "summary"),
      primaryTitle: readText(formData, "primaryTitle"),
      primaryBody: readText(formData, "primaryBody"),
      secondaryTitle: readText(formData, "secondaryTitle"),
      secondaryBody: readText(formData, "secondaryBody"),
      ctaLabel: readText(formData, "ctaLabel"),
      ctaHref: readText(formData, "ctaHref"),
      embedCode: readText(formData, "embedCode"),
    },
    session.uid
  );

  revalidatePath("/temporal");
  revalidatePath("/admin/temporal");
}
