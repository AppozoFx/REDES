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
  const hasInput = email.trim().length > 0 || password.length > 0;
  const edgePhase = success ? "connected" : error ? "error" : loading || hasInput ? "loading" : "idle";
  const edgeStroke =
    edgePhase === "connected"
      ? "rgba(74, 222, 128, 0.88)"
      : edgePhase === "error"
        ? "rgba(248, 113, 113, 0.84)"
        : "rgba(96, 165, 250, 0.82)";
  const edgeGlow =
    edgePhase === "connected"
      ? "drop-shadow(0 0 7px rgba(74, 222, 128, 0.24))"
      : edgePhase === "error"
        ? "drop-shadow(0 0 6px rgba(248, 113, 113, 0.2))"
        : "drop-shadow(0 0 6px rgba(96, 165, 250, 0.2))";
  const nodeTint =
    edgePhase === "connected"
      ? "text-emerald-300"
      : edgePhase === "error"
        ? "text-red-300"
        : edgePhase === "loading"
          ? "text-sky-200"
          : "text-sky-300";
  const statusLabel = success
    ? "Conectado"
    : error
      ? "Error de acceso"
      : loading
        ? "Conectando"
        : hasInput
          ? "Validando"
          : "";
  const shortError =
    error && (error.toLowerCase().includes("invalid") || error.toLowerCase().includes("wrong"))
      ? "Credenciales inválidas."
      : error
        ? "No se pudo conectar."
        : null;

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
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-[#0b142d] via-[#1a2c58] to-[#2f2850] p-6 text-gray-900">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#30518c]/18 blur-[130px]" />
      <div className="pointer-events-none absolute -right-12 top-10 h-72 w-72 rounded-full bg-violet-300/10 blur-[115px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      <div className="relative z-10 flex min-h-dvh items-center justify-center py-6">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[450px]"
        >
          <form
            onSubmit={onSubmit}
            aria-busy={loading}
            className="relative space-y-6 overflow-hidden rounded-[22px] border border-white/10 bg-[#11131a]/90 p-8 text-slate-100 shadow-[0_26px_80px_rgba(4,8,20,0.5)] backdrop-blur-xl"
          >
            <div className="absolute left-4 top-4 z-30 inline-flex items-center gap-2.5">
              <motion.div
                aria-label="Nodo de red FTTH"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/25 backdrop-blur-md"
                animate={
                  edgePhase === "connected"
                    ? { scale: 1, opacity: 1 }
                    : edgePhase === "loading"
                      ? { scale: [1, 1.08, 1], opacity: [0.88, 1, 0.88] }
                      : { scale: [1, 1.06, 1], opacity: [0.8, 0.96, 0.8] }
                }
                transition={
                  edgePhase === "connected"
                    ? { duration: 0.25 }
                    : edgePhase === "loading"
                      ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 2.1, repeat: Infinity, ease: "easeInOut" }
                }
                style={{
                  boxShadow:
                    edgePhase === "connected"
                      ? "0 0 0 1px rgba(74,222,128,0.28), 0 0 14px rgba(74,222,128,0.2)"
                      : "0 0 0 1px rgba(96,165,250,0.25), 0 0 12px rgba(96,165,250,0.18)",
                }}
              >
                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${nodeTint}`} fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="19" cy="7" r="2" />
                  <circle cx="19" cy="17" r="2" />
                  <path d="M7 12h6m0 0l4-5m-4 5l4 5" />
                </svg>
              </motion.div>
              <AnimatePresence mode="wait">
                {statusLabel ? (
                  <motion.span
                    key={statusLabel}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    className={`text-xs font-medium ${
                      success ? "text-emerald-300" : error ? "text-red-300" : "text-slate-300"
                    }`}
                  >
                    {statusLabel}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>

            <div aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[22px] opacity-75 mix-blend-screen">
              <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <motion.rect
                  key={edgePhase}
                  x="0.35"
                  y="0.35"
                  width="99.3"
                  height="99.3"
                  rx="5"
                  fill="none"
                  stroke={edgeStroke}
                  strokeWidth="0.34"
                  strokeLinecap="round"
                  pathLength={edgePhase === "connected" ? 1 : 1}
                  strokeDasharray={
                    edgePhase === "connected"
                      ? undefined
                      : edgePhase === "loading"
                        ? "0.13 0.87"
                        : "0.05 0.95"
                  }
                  initial={
                    edgePhase === "connected"
                      ? { pathLength: 0.04, opacity: 0.72 }
                      : edgePhase === "idle"
                        ? { strokeDashoffset: 0, opacity: 0.7 }
                        : false
                  }
                  animate={
                    edgePhase === "connected"
                      ? { pathLength: 1, opacity: 1 }
                      : edgePhase === "loading"
                        ? { strokeDashoffset: [0, -1], opacity: [0.62, 0.96, 0.62] }
                        : { strokeDashoffset: [0, -1, 0], opacity: [0.7, 0.98, 0.7] }
                  }
                  transition={
                    edgePhase === "connected"
                      ? { duration: 1.05, ease: "easeOut" }
                      : edgePhase === "loading"
                        ? { duration: 1.6, repeat: Infinity, ease: "linear" }
                        : { duration: 2.1, repeat: Infinity, ease: "easeInOut" }
                  }
                  style={{ filter: edgeGlow }}
                />
              </svg>
            </div>

            <header className="space-y-3.5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <img src="/img/logo.png" alt="Logo REDES M&D" className="h-11 w-11 object-contain" />
              </div>
              <h1 className="text-[23px] font-semibold tracking-[-0.02em] text-white">
                Bienvenido a <span className="text-[#90aee4]">REDES M&amp;D</span>
              </h1>
              <p className="text-[13.5px] leading-5 text-slate-300">Ingresa tus credenciales para continuar</p>
            </header>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-200">
                Correo
              </label>
              <input
                id="email"
                aria-label="Correo corporativo"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1017] px-3.5 text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-400 focus-visible:border-[#30518c]/65 focus-visible:ring-2 focus-visible:ring-[#30518c]/35"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                type="email"
                required
                disabled={loading}
              />
              <p className="text-xs text-slate-400">Usa tu correo corporativo.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-200">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  aria-label="Contraseña"
                  aria-describedby="password-hint"
                  type={showPassword ? "text" : "password"}
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1017] px-3.5 pr-11 text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-400 focus-visible:border-[#30518c]/65 focus-visible:ring-2 focus-visible:ring-[#30518c]/35"
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
                  className="absolute inset-y-0 right-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#30518c]/40"
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
              <p id="password-hint" className="text-xs text-slate-400">
                Mínimo 8 caracteres.
              </p>
            </div>

            {shortError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {shortError}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              className="relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#30518c] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/30 hover:bg-[#3a5f9e] active:bg-[#264477] disabled:cursor-not-allowed disabled:opacity-65"
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

            <AnimatePresence />
          </form>

          <p className="mt-4 text-center text-xs text-white/75">
            {year} RedesMYD | Desarrollado por Arturo Pozo
          </p>
        </motion.div>
      </div>
    </div>
  );
}
