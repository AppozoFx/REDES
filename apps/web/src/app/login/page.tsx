"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      // Garantiza que currentUser persista tras refresh
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);

     const idToken = await cred.user.getIdToken(true);

const res = await fetch("/api/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ idToken }),

});
const payload = JSON.parse(atob(idToken.split(".")[1]));
console.log("TOKEN iss:", payload.iss);
console.log("TOKEN aud:", payload.aud);
// Log del projectId del cliente para comparar con aud
try { console.log("APP projectId:", (auth.app.options as any)?.projectId); } catch {}

const text = await res.text();
if (!res.ok) throw new Error(`session (${res.status}): ${text}`);





      router.push("/admin");
    } catch (err: any) {
      setError(err?.message ?? "Error de login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded p-6">
        <h1 className="text-xl font-semibold">Login</h1>

        <div className="space-y-1">
          <label className="text-sm">Email</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button
          disabled={loading}
          className="w-full rounded border px-3 py-2 hover:bg-black/5 disabled:opacity-50"
          type="submit"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-xs opacity-70">
          (Dev) Usa credenciales del Auth Emulator / bootstrap.
        </p>
      </form>
    </div>
  );
}
