"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  listenGlobalNotifications,
  markNotificationRead,
  NotificacionDoc,
} from "@/domain/notificaciones/repo";

export function NotificationsBell({ uid }: { uid: string }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificacionDoc[]>([]);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthReady(!!user);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!uid) return;
    if (!authReady) return; // ⬅️ evita permission-denied si no hay auth cliente
    const unsub = listenGlobalNotifications(uid, setItems, 20);
    return () => unsub();
  }, [uid, authReady]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md px-3 py-2 hover:bg-white/10"
      >
        Notificaciones
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-2 text-xs text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
  <div className="absolute right-0 mt-2 w-96 max-w-[90vw] rounded-lg border border-gray-200 bg-white p-2 shadow-lg z-50 dark:border-white/10 dark:bg-black">
    <div className="flex items-center justify-between px-2 py-1">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        Notificaciones
      </div>
      <button
        type="button"
        className="text-xs text-gray-600 hover:text-gray-900 dark:text-white/80 dark:hover:text-white"
        onClick={() => setOpen(false)}
      >
        Cerrar
      </button>
    </div>

    <div className="max-h-96 overflow-auto">
      {items.length === 0 ? (
        <div className="p-3 text-sm text-gray-600 dark:text-white/70">
          No hay notificaciones.
        </div>
      ) : (
        items.map((n) => (
          <div
            key={n.id}
            className="rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {n.title}
                  {!n.read && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-white/70">
                      (nuevo)
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-700 dark:text-white/80">
                  {n.message}
                </div>

                <div className="mt-1 text-[11px] text-gray-500 dark:text-white/60">
                  {n.entityType} · {n.action}
                </div>
              </div>

              {!n.read && (
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-gray-900 dark:text-white/80 dark:hover:text-white"
                  onClick={() => markNotificationRead(uid, n.id)}
                >
                  Marcar leído
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}



    </div>
  );
}
