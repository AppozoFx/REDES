"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  listenGlobalNotifications,
  markNotificationRead,
  NotificacionDoc,
} from "@/domain/notificaciones/repo";
import { markAllNotificationsRead } from "@/domain/notificaciones/repo";

function timeAgo(ts: any) {
  if (!ts) return "";
  const d =
    typeof ts?.toDate === "function"
      ? ts.toDate()
      : typeof ts?.seconds === "number"
      ? new Date(ts.seconds * 1000)
      : null;
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return "hace unos segundos";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} d`;
}

export function NotificationsBell({ uid }: { uid: string }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificacionDoc[]>([]);
  const [authUid, setAuthUid] = React.useState<string | null>(null);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      const u = user?.uid ?? null;
      setAuthUid(u);
      // Debug de autenticaciÃ³n en cliente
      // eslint-disable-next-line no-console
      console.log("[NotificationsBell] auth.currentUser", { uidProp: uid, authUid: u, isReady: !!u });
    });
    return () => unsub();
  }, [uid]);

  React.useEffect(() => {
    if (!authUid) return; // evita permission-denied si no hay auth cliente
    const unsub = listenGlobalNotifications(authUid, setItems, 20);
    return () => unsub();
  }, [authUid]);

  const unread = items.filter((n) => !n.read).length;

  const markingRef = React.useRef(false);

React.useEffect(() => {
  if (!open) return;
  if (!authUid) return;

  const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
  if (!unreadIds.length) return;
  if (markingRef.current) return;

  // Optimistic: marcar como leÃ­do localmente
  setItems((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)));

  markingRef.current = true;
  markAllNotificationsRead(authUid, unreadIds)
    .catch(() => {
      // revertir optimismo si falla
      setItems((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: false } : n)));
    })
    .finally(() => {
      // permitir futuros âopenâ si llegan nuevas notifs
      markingRef.current = false;
    });
}, [open, authUid, items]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => {
            const opening = !prev;
            if (opening && authUid) {
              const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
              if (unreadIds.length && !markingRef.current) {
                // Optimistic local update
                setItems((prevItems) =>
                  prevItems.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n))
                );
                markingRef.current = true;
                markAllNotificationsRead(authUid, unreadIds)
                  .catch(() => {
                    // revert optimistic in case of error
                    setItems((prevItems) =>
                      prevItems.map((n) => (unreadIds.includes(n.id) ? { ...n, read: false } : n))
                    );
                  })
                  .finally(() => {
                    markingRef.current = false;
                  });
              }
            }
            return opening;
          })
        }
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
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Notificaciones</div>
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
              <div className="p-3 text-sm text-gray-600 dark:text-white/70">No hay notificaciones.</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {n.title}
                        {!n.read && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-white/70">(nuevo)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-700 dark:text-white/80">{n.message}</div>
                      {(n.entityType === "DESPACHO" || n.entityType === "DEVOLUCION" || n.entityType === "VENTA") && n.entityId && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:underline dark:text-blue-300"
                            onClick={async () => {
                              try {
                                const tipo =
                                  n.entityType === "DEVOLUCION" ? "devolucion" :
                                  n.entityType === "VENTA" ? "ventas" :
                                  "despacho";
                                const res = await fetch(
                                  `/api/transferencias/instalaciones/guia/url?guiaId=${encodeURIComponent(
                                    n.entityId
                                  )}&tipo=${tipo}`,
                                  { cache: "no-store" }
                                );
                                if (!res.ok) throw new Error("URL_FAIL");
                                const data = await res.json();
                                if (data?.url) window.open(data.url, "_blank");
                              } catch {
                                // silent
                              }
                            }}
                          >
                            Ver comprobante
                          </button>
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-white/60">
                        {n.entityType} · {n.action}
                        {n.createdAt ? ` · ${timeAgo(n.createdAt)}` : ""}
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        className="text-xs text-gray-600 hover:text-gray-900 dark:text-white/80 dark:hover:text-white"
                        onClick={() => {
                          if (!authUid) return;
                          // Optimistic inmediato
                          setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
                          markNotificationRead(authUid, n.id).catch(() => {
                            // revertir si falla
                            setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: false } : it)));
                          });
                        }}
                      >
                        Marcar leÃ­do
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

