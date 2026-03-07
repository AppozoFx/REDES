"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from "sonner";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { NotificacionDoc } from "@/domain/notificaciones/repo";
import { listenGlobalNotifications } from "@/domain/notificaciones/repo";

/**
 * Componente global silencioso:
 * - Escucha notificaciones en tiempo real (solo si hay Firebase Auth client).
 * - Dispara toast por cada notificacion NO leida que aun no se mostro.
 */
export function NotificationsRealtime() {
  const [authUid, setAuthUid] = React.useState<string | null>(null);
  const shownRef = React.useRef<Set<string>>(new Set());
  const readyRef = React.useRef(false);
  const mountedAtRef = React.useRef<number>(Date.now());

  const tsToMillis = (ts: any) => {
    if (!ts) return 0;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") return ts.seconds * 1000;
    return 0;
  };

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUid(user?.uid ?? null);
      readyRef.current = true;
    });
    return () => unsub();
  }, []);

  // Clic fuera del toast => cerrar toasts visibles
  React.useEffect(() => {
    const dismissAll = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (target?.closest?.("[data-sonner-toast]")) return;
      toast.dismiss();
    };
    window.addEventListener("mousedown", dismissAll);
    return () => window.removeEventListener("mousedown", dismissAll);
  }, []);

  React.useEffect(() => {
    if (!readyRef.current) return;
    if (!authUid) return;

    const unsub = listenGlobalNotifications(
      authUid,
      (items: NotificacionDoc[]) => {
        let emitted = 0;
        for (const n of items) {
          if (n.read) continue;
          if (shownRef.current.has(n.id)) continue;

          const createdMs = tsToMillis(n.createdAt);
          // No toastear backlog viejo al entrar
          if (createdMs && createdMs < mountedAtRef.current - 2000) {
            shownRef.current.add(n.id);
            continue;
          }

          // Evitar rafagas
          if (emitted >= 3) continue;

          shownRef.current.add(n.id);
          emitted += 1;

          const title = n.title ?? "Notificacion";
          const desc = n.message ?? "";
          const DURATION = 3000;

          if (n.type === "success") toast.success(title, { description: desc, duration: DURATION });
          else if (n.type === "error") toast.error(title, { description: desc, duration: DURATION });
          else if (n.type === "warn") toast.warning(title, { description: desc, duration: DURATION });
          else toast(title, { description: desc, duration: DURATION });
        }
      },
      20
    );

    return () => unsub();
  }, [authUid]);

  return null;
}
