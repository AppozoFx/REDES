"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebaseClient";

type AccessState = {
  loading: boolean;
  isAdmin: boolean;
  roles: string[];
  areas: string[];
};

export function useAccess(): AccessState {
  const [state, setState] = useState<AccessState>({
    loading: true,
    isAdmin: false,
    roles: [],
    areas: [],
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, isAdmin: false, roles: [], areas: [] });
        return;
      }

      try {
        const ref = doc(db, "usuarios_access", user.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setState({ loading: false, isAdmin: false, roles: [], areas: [] });
          return;
        }

        const data = snap.data();
        const roles = data.roles ?? [];
        const areas = data.areas ?? [];
        const enabled = data.estadoAcceso === "HABILITADO";

        setState({
          loading: false,
          isAdmin: enabled && roles.includes("ADMIN"),
          roles,
          areas,
        });
      } catch {
        setState({ loading: false, isAdmin: false, roles: [], areas: [] });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
