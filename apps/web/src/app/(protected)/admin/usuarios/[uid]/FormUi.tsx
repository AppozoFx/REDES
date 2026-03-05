"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function PendingFieldset({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset
      disabled={pending}
      aria-busy={pending}
      className={`space-y-4 ${pending ? "opacity-90" : ""}`}
    >
      {children}
    </fieldset>
  );
}

type SubmitActionButtonProps = {
  idleText: string;
  pendingText: string;
  doneText: string;
  className: string;
};

export function SubmitActionButton({ idleText, pendingText, doneText, className }: SubmitActionButtonProps) {
  const { pending } = useFormStatus();
  const [done, setDone] = useState(false);
  const [wasPending, setWasPending] = useState(false);

  useEffect(() => {
    if (pending) {
      setWasPending(true);
      setDone(false);
      return;
    }
    if (!pending && wasPending) {
      setDone(true);
      setWasPending(false);
      const t = setTimeout(() => setDone(false), 1300);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending]);

  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}>
      <span className={`inline-flex items-center gap-2 transition ${pending ? "animate-pulse" : ""}`}>
        {pending ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-30" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" className="opacity-95" />
          </svg>
        ) : done ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : null}
        {pending ? pendingText : done ? doneText : idleText}
      </span>
    </button>
  );
}
