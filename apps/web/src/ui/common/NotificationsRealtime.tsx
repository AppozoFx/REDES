"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from "sonner";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { NotificacionDoc } from "@/domain/notificaciones/repo";
import { listenGlobalNotifications } from "@/domain/notificaciones/repo";

/**
 * Componente global “silencioso”:
 * - Escucha notificaciones en tiempo real (solo si hay Firebase Auth client).
 * - Dispara toast por cada notificación NO leída que aún no se mostró.
 */
export function NotificationsRealtime() {
  const [authUid, setAuthUid] = React.useState<string | null>(null);
  const shownRef = React.useRef<Set<string>>(new Set());
  const readyRef = React.useRef(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
      readyRef.current = true;
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!readyRef.current) return;
    if (!authUid) return;

    const unsub = listenGlobalNotifications(authUid, (items: NotificacionDoc[]) => {
      for (const n of items) {
        if (n.read) continue;              // si ya está leído, no toastear
        if (shownRef.current.has(n.id)) continue; // evitar duplicados

        shownRef.current.add(n.id);

        // map type -> toast
        const title = n.title ?? "Notificación";
        const desc = n.message ?? "";

        const DURATION = 3000;
        if (n.type === "success") toast.success(title, { description: desc, duration: DURATION });
        else if (n.type === "error") toast.error(title, { description: desc, duration: DURATION });
        else if (n.type === "warn") toast.warning(title, { description: desc, duration: DURATION });
        else toast(title, { description: desc, duration: DURATION });
      }
    }, 20);

    return () => unsub();
  }, [authUid]);

  return null;
}
