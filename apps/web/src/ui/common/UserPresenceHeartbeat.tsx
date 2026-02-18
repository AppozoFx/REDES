"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 60_000;

export default function UserPresenceHeartbeat() {
  useEffect(() => {
    let alive = true;

    const ping = async () => {
      if (!alive) return;
      try {
        await fetch("/api/auth/presencia", { method: "POST", cache: "no-store" });
      } catch {}
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);

    const onFocus = () => ping();
    const onVisibility = () => {
      if (!document.hidden) ping();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

