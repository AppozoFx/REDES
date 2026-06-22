"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ReactNode } from "react";

type ActionResult = { ok: boolean; error?: { formErrors: string[] } } | null;

export function FormWrapper({
  action,
  successMsg,
  failMsg,
  children,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (prev: any, formData: FormData) => Promise<ActionResult>;
  successMsg: string;
  failMsg?: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(successMsg);
    } else {
      const msg = state.error?.formErrors?.[0] ?? (failMsg ?? "Ocurrió un error.");
      toast.error(msg);
    }
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  );
}
