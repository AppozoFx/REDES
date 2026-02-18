"use client";

import { useEffect } from "react";

const KEY_TABS = "redes_active_tabs_v1";
const KEY_LAST_LOGIN = "redes_last_login_at";
const TTL_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const LOGIN_GRACE_MS = 120_000;

type TabsMap = Record<string, number>;

function safeNow() {
  return Date.now();
}

function readTabs(): TabsMap {
  try {
    const raw = localStorage.getItem(KEY_TABS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTabs(map: TabsMap) {
  try {
    localStorage.setItem(KEY_TABS, JSON.stringify(map));
  } catch {}
}

function pruneTabs(map: TabsMap, now: number) {
  const next: TabsMap = {};
  for (const [id, ts] of Object.entries(map)) {
    if (Number.isFinite(ts) && now - Number(ts) <= TTL_MS) next[id] = Number(ts);
  }
  return next;
}

function getTabId() {
  try {
    const existing = sessionStorage.getItem("redes_tab_id");
    if (existing) return existing;
    const id = `tab_${Math.random().toString(36).slice(2)}_${safeNow()}`;
    sessionStorage.setItem("redes_tab_id", id);
    return id;
  } catch {
    return `tab_fallback_${safeNow()}`;
  }
}

export default function TabSessionGuard() {
  useEffect(() => {
    const now = safeNow();
    const tabId = getTabId();

    const current = pruneTabs(readTabs(), now);
    const hasActiveTabs = Object.keys(current).length > 0;

    let lastLogin = 0;
    try {
      lastLogin = Number(localStorage.getItem(KEY_LAST_LOGIN) || 0);
    } catch {}
    const justLoggedIn = now - lastLogin <= LOGIN_GRACE_MS;

    if (!hasActiveTabs && !justLoggedIn) {
      (async () => {
        try {
          await fetch("/api/auth/presencia", { method: "DELETE" });
        } catch {}
        try {
          await fetch("/api/auth/session", { method: "DELETE" });
        } catch {}
        window.location.href = "/login";
      })();
      return;
    }

    const markAlive = () => {
      const t = safeNow();
      const tabs = pruneTabs(readTabs(), t);
      tabs[tabId] = t;
      writeTabs(tabs);
    };

    const removeTab = () => {
      const t = safeNow();
      const tabs = pruneTabs(readTabs(), t);
      delete tabs[tabId];
      writeTabs(tabs);
    };

    markAlive();
    const timer = window.setInterval(markAlive, HEARTBEAT_MS);
    window.addEventListener("pagehide", removeTab);
    window.addEventListener("beforeunload", removeTab);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", removeTab);
      window.removeEventListener("beforeunload", removeTab);
      removeTab();
    };
  }, []);

  return null;
}
