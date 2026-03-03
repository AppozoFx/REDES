"use client";

import React, { useActionState } from "react";
import { useRouter } from "next/navigation";
import ComunicadoForm from "@/ui/admin/comunicados/ComunicadoForm";
import type { ComunicadoFormState } from "@/app/(protected)/admin/comunicados/actions";
import { comunicadosCreateWithStateAction } from "@/app/(protected)/admin/comunicados/actions";

type RoleItem = { id: string; nombre?: string };

type Props = {
  rolesCatalog: RoleItem[];
  areasCatalog: string[];
  backHref: string;
};

export default function ComunicadoCreateFormClient({
  rolesCatalog,
  areasCatalog,
  backHref,
}: Props) {
  const router = useRouter();

  const [state, formAction] = useActionState<ComunicadoFormState, FormData>(
    comunicadosCreateWithStateAction,
    null
  );

  React.useEffect(() => {
    if (state?.ok && state?.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <div className="p-6">
      {state?.ok === false && state?.error ? (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
          <div className="font-medium">No se pudo guardar</div>
          <div>{state.error}</div>
        </div>
      ) : null}

      <form action={formAction}>
        <ComunicadoForm
          mode="create"
          rolesCatalog={rolesCatalog}
          areasCatalog={areasCatalog}
          backHref={backHref}
          headerTitle="Nuevo comunicado"
          headerSubtitle="Configura contenido, audiencia y vigencia del comunicado."
        />
      </form>
    </div>
  );
}
