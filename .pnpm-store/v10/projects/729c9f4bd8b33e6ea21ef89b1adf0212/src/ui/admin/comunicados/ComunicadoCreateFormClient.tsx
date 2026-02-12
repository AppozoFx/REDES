"use client";

import React, { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import ComunicadoForm from "@/ui/admin/comunicados/ComunicadoForm";
import type { ComunicadoFormState } from "@/app/(protected)/admin/comunicados/actions";
import { comunicadosCreateWithStateAction } from "@/app/(protected)/admin/comunicados/actions";

type RoleItem = { id: string; nombre?: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg border px-4 py-2 text-sm"
      type="submit"
      disabled={pending}
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

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

  // ✅ React 19: useActionState devuelve [state, action, isPending]
  const [state, formAction, isPending] = useActionState<
    ComunicadoFormState,
    FormData
  >(comunicadosCreateWithStateAction, null);

  // Si tu state incluye redirectTo, puedes redirigir aquí.
  // (Si no lo usas, no pasa nada.)
  React.useEffect(() => {
    if (state?.ok && state?.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {state?.ok === false && state?.error ? (
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">No se pudo guardar</div>
          <div className="text-muted-foreground">{state.error}</div>
        </div>
      ) : null}

      <form action={formAction}>
        <ComunicadoForm
          mode="create"
          rolesCatalog={rolesCatalog}
          areasCatalog={areasCatalog}
          backHref={backHref}
          headerTitle="Nuevo comunicado"
        />

        <div className="mt-4 flex gap-2">
          <SubmitButton label="Crear" />
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => router.push(backHref)}
            disabled={isPending}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
