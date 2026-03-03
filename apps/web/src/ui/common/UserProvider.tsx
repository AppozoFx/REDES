"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type UserIdentity = {
  uid: string;
  nombre: string;
  isAdmin: boolean;
  roles: string[];
  areas: string[];
};

type UserContextValue = {
  user: UserIdentity | null;
  loading: boolean;
  error: string;
};

const UserContext = createContext<UserContextValue | null>(null);

let cachedUser: UserIdentity | null = null;
let inflightUserPromise: Promise<UserIdentity | null> | null = null;

async function loadUserIdentity(): Promise<UserIdentity | null> {
  if (cachedUser) return cachedUser;
  if (inflightUserPromise) return inflightUserPromise;

  inflightUserPromise = (async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      throw new Error(String(body?.error || "ERROR"));
    }
    const user: UserIdentity = {
      uid: String(body.uid || ""),
      nombre: String(body.nombre || ""),
      isAdmin: !!body.isAdmin,
      roles: Array.isArray(body.roles) ? body.roles : [],
      areas: Array.isArray(body.areas) ? body.areas : [],
    };
    cachedUser = user;
    return user;
  })();

  try {
    return await inflightUserPromise;
  } finally {
    inflightUserPromise = null;
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserIdentity | null>(cachedUser);
  const [loading, setLoading] = useState<boolean>(!cachedUser);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    if (cachedUser) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const next = await loadUserIdentity();
        if (!mounted) return;
        setUser(next);
        setError("");
      } catch (e: any) {
        if (!mounted) return;
        setError(String(e?.message || "ERROR"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      error,
    }),
    [user, loading, error]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserIdentity() {
  const ctx = useContext(UserContext);
  if (!ctx) return { user: null, loading: false, error: "" };
  return ctx;
}

