"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import { getFirebaseAuth } from "../../lib/firebase/client";


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      // Garantiza que currentUser persista tras refresh
      await setPersistence(auth, browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);

     const idToken = await cred.user.getIdToken(true);

const res = await fetch("/api/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ idToken }),

});

const text = await res.text();
if (!res.ok) throw new Error(`session (${res.status}): ${text}`);





      try {
        localStorage.setItem("redes_last_login_at", String(Date.now()));
      } catch {}
      setSuccess(true);
      // Forzar recarga completa para asegurar que el servidor lea la cookie __session
      setTimeout(() => window.location.replace("/"), 700);
    } catch (err: any) {
      setError(err?.message ?? "Error de login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-[#0f1a2e] via-[#1e3a8a] to-[#ff6413] p-6 text-gray-900">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#ff6413]/35 blur-3xl" />

      <div className="relative z-10 flex min-h-dvh items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <form
            onSubmit={onSubmit}
            aria-busy={loading}
            className="space-y-5 rounded-2xl border border-white/15 bg-white/80 p-6 shadow-2xl backdrop-blur-xl dark:bg-white/10"
          >
            <header className="space-y-3 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/60 ring-1 ring-white/50">
                <img src="/img/logo.png" alt="Logo REDES M&D" className="h-14 w-14 object-contain" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Bienvenido a <span className="text-[#ff6413]">REDES M&amp;D</span>
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-200">
                Ingresa tus credenciales para continuar
              </p>
            </header>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Correo
              </label>
              <input
                id="email"
                aria-label="Correo corporativo"
                className="w-full rounded-xl border border-gray-300 bg-white/90 px-3 py-2.5 text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-orange-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
                required
                disabled={loading}
              />
              <p className="text-xs text-gray-500 dark:text-gray-200">Usa tu correo corporativo.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  aria-label="Contraseña"
                  aria-describedby="password-hint"
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-xl border border-gray-300 bg-white/90 px-3 py-2.5 pr-11 text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-orange-400"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-black/5 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 102.8 2.8" />
                      <path d="M9.9 4.2A10.7 10.7 0 0112 4c6.5 0 10 8 10 8a18.5 18.5 0 01-4.2 5.7" />
                      <path d="M6.6 6.6A18.8 18.8 0 002 12s3.5 8 10 8a10.8 10.8 0 005.4-1.4" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <p id="password-hint" className="text-xs text-gray-500 dark:text-gray-200">
                Mínimo 8 caracteres.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/30 dark:text-red-200">
                {error}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#30518c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#264477] disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" className="opacity-25" stroke="currentColor" strokeWidth="3" />
                    <path d="M22 12a10 10 0 00-10-10" className="opacity-90" stroke="currentColor" strokeWidth="3" />
                  </svg>
                  Ingresando
                </>
              ) : success ? (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  ¡Éxito!
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                    <path d="M10 17l5-5-5-5" />
                    <path d="M15 12H3" />
                  </svg>
                  Entrar
                </>
              )}
            </motion.button>

            <AnimatePresence>
              {success && !loading ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  role="status"
                  aria-live="polite"
                  className="rounded-full bg-green-100 px-4 py-2 text-center text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300"
                >
                  Ingreso exitoso. Redirigiendo
                </motion.div>
              ) : null}
            </AnimatePresence>
          </form>

          <p className="mt-4 text-center text-xs text-white/85">
            {year} RedesMYD | Desarrollado por Arturo Pozo
          </p>
        </motion.div>
      </div>
    </div>
  );
}
