"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence, browserLocalPersistence } from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import { getFirebaseAuth } from "../../lib/firebase/client";
import ParticlesBackground from "./ParticlesBackground";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
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
      ? "drop-shadow(0 0 10px rgba(74, 222, 128, 0.65))"
      : edgePhase === "error"
        ? "drop-shadow(0 0 9px rgba(248, 113, 113, 0.58))"
        : "drop-shadow(0 0 9px rgba(96, 165, 250, 0.45))";
  const edgeGlowHalo =
    edgePhase === "connected"
      ? "drop-shadow(0 0 6px rgba(74, 222, 128, 0.55))"
      : edgePhase === "error"
        ? "drop-shadow(0 0 6px rgba(248, 113, 113, 0.48))"
        : "drop-shadow(0 0 6px rgba(96, 165, 250, 0.38))";
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
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
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

      <ParticlesBackground />

      <div className="pointer-events-none relative z-10 flex min-h-dvh items-center justify-center py-6">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="pointer-events-auto w-full max-w-[450px]"
        >
          <div className="relative">
              <form
                onSubmit={onSubmit}
                aria-busy={loading}
                className="relative space-y-6 overflow-hidden rounded-[22px] border border-white/10 bg-[#11131a]/90 p-8 text-slate-100 shadow-[0_26px_80px_rgba(4,8,20,0.5),0_0_60px_rgba(48,81,140,0.12)] backdrop-blur-xl"
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

                <div aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[22px] mix-blend-screen">
                  <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {/* Halo: trazo ancho y suave que da luminosidad sin durezas */}
                    <motion.rect
                      key={`halo-${edgePhase}`}
                      x="0.35" y="0.35" width="99.3" height="99.3" rx="5"
                      fill="none"
                      stroke={edgeStroke}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={
                        edgePhase === "connected"
                          ? undefined
                          : edgePhase === "loading"
                            ? "0.13 0.87"
                            : "0.05 0.95"
                      }
                      initial={
                        edgePhase === "connected"
                          ? { pathLength: 0.04, opacity: 0 }
                          : edgePhase === "idle"
                            ? { strokeDashoffset: 0, opacity: 0 }
                            : false
                      }
                      animate={
                        edgePhase === "connected"
                          ? { pathLength: 1, opacity: 0.22 }
                          : edgePhase === "loading"
                            ? { strokeDashoffset: [0, -1], opacity: [0.12, 0.26, 0.12] }
                            : { strokeDashoffset: [0, -1, 0], opacity: [0.09, 0.2, 0.09] }
                      }
                      transition={
                        edgePhase === "connected"
                          ? { duration: 1.05, ease: "easeOut" }
                          : edgePhase === "loading"
                            ? { duration: 1.6, repeat: Infinity, ease: "linear" }
                            : { duration: 2.1, repeat: Infinity, ease: "easeInOut" }
                      }
                      style={{ filter: edgeGlowHalo }}
                    />
                    {/* Línea nítida: borde preciso con glow reforzado */}
                    <motion.rect
                      key={`line-${edgePhase}`}
                      x="0.35" y="0.35" width="99.3" height="99.3" rx="5"
                      fill="none"
                      stroke={edgeStroke}
                      strokeWidth="0.45"
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
                  <div className="mx-auto flex h-[78px] w-[78px] items-center justify-center rounded-full border border-[#30518c]/55 bg-[#0b1120] shadow-[0_0_0_5px_rgba(48,81,140,0.1),0_0_24px_rgba(48,81,140,0.38)]">
                    <img src="/img/logo.png" alt="Logo REDES M&D" className="h-[52px] w-[52px] object-contain" />
                  </div>
                  <h1 className="text-[23px] font-semibold tracking-[-0.02em] text-white">
                    Bienvenido a <span className="text-[#90aee4]">REDES M&amp;D</span>
                  </h1>
                  <p className="text-[13.5px] leading-5 text-slate-300">Ingresa tus credenciales para continuar</p>
                </header>

                {/* Campo correo electrónico */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-slate-200">
                    Correo electrónico
                  </label>
                  <div className={`relative rounded-xl transition-shadow duration-200 ${focusedField === "email" ? "shadow-[0_0_0_2px_rgba(48,81,140,0.55),0_0_18px_rgba(48,81,140,0.18)]" : ""}`}>
                    <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                      <svg
                        className={`h-[15px] w-[15px] transition-colors duration-200 ${focusedField === "email" ? "text-[#90aee4]" : "text-slate-500"}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                      >
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <input
                      id="email"
                      aria-label="Correo electrónico"
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1017] pl-10 pr-3.5 text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-500 focus-visible:border-[#30518c]/65 focus-visible:ring-2 focus-visible:ring-[#30518c]/30"
                      placeholder="nombre@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="email"
                      type="email"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Campo contraseña */}
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-200">
                    Contraseña
                  </label>
                  <div className={`relative rounded-xl transition-shadow duration-200 ${focusedField === "password" ? "shadow-[0_0_0_2px_rgba(48,81,140,0.55),0_0_18px_rgba(48,81,140,0.18)]" : ""}`}>
                    <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                      <svg
                        className={`h-[15px] w-[15px] transition-colors duration-200 ${focusedField === "password" ? "text-[#90aee4]" : "text-slate-500"}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <input
                      id="password"
                      aria-label="Contraseña"
                      type={showPassword ? "text" : "password"}
                      className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1017] pl-10 pr-11 text-slate-100 outline-none transition-all duration-200 placeholder:text-slate-500 focus-visible:border-[#30518c]/65 focus-visible:ring-2 focus-visible:ring-[#30518c]/30"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
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
                </div>

                {/* Recordar sesión + restablecer contraseña */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="group flex cursor-pointer select-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded border transition-all duration-200 ${
                      rememberMe ? "border-[#30518c] bg-[#30518c]" : "border-white/25 bg-[#0d1017] group-hover:border-white/40"
                    }`}>
                      {rememberMe && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors duration-200">Recordar sesión</span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-slate-400 transition-colors duration-200 hover:text-[#90aee4] focus-visible:outline-none"
                    onClick={() => {}}
                  >
                    Restablecer contraseña
                  </button>
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
          </div>

          <p className="mt-4 text-center text-xs text-white/75">
            {year} RedesMYD | Desarrollado por Arturo Pozo
          </p>
        </motion.div>
      </div>
    </div>
  );
}
