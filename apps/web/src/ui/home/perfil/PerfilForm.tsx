"use client";

import { FormEvent, useActionState, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import type { PerfilUpdateState } from "@/app/(protected)/home/perfil/actions";
import { updateMyProfileAction } from "@/app/(protected)/home/perfil/actions";
import { getFirebaseAuth } from "@/lib/firebase/client";

type PerfilDefaults = {
  celular: string;
  direccion: string;
  nombreCompleto: string;
  email: string;
  tipoDoc: string;
  nroDoc: string;
  fIngreso: string;
  fNacimiento: string;
  fNacimientoInput: string;
  roles: string[];
  areas: string[];
  estadoAcceso: "HABILITADO" | "INHABILITADO";
};

function firstLetter(v: string) {
  const s = String(v || "").trim();
  return s ? s[0].toUpperCase() : "U";
}

export default function PerfilForm({ defaults }: { defaults: PerfilDefaults }) {
  const [state, action, pending] = useActionState<PerfilUpdateState, FormData>(
    updateMyProfileAction,
    null
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const nombre = defaults.nombreCompleto || "Usuario";
  const email = defaults.email || "Sin correo";
  const roles = defaults.roles.length ? defaults.roles.join(", ") : "Sin rol";
  const areas = defaults.areas.length ? defaults.areas.join(", ") : "Sin area";

  async function onSubmitPassword(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setPassError(null);
    setPassOk(null);

    const cur = currentPassword.trim();
    const next = newPassword.trim();
    const conf = confirmPassword.trim();

    if (!cur || !next || !conf) {
      setPassError("Completa todos los campos de contrasena.");
      return;
    }
    if (next.length < 8) {
      setPassError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== conf) {
      setPassError("La confirmacion no coincide con la nueva contrasena.");
      return;
    }
    if (next === cur) {
      setPassError("La nueva contrasena debe ser diferente a la actual.");
      return;
    }

    setPassLoading(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      const emailForAuth = user?.email || defaults.email;

      if (!user || !emailForAuth) {
        throw new Error("No se pudo validar la sesion actual.");
      }

      const cred = EmailAuthProvider.credential(emailForAuth, cur);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      await signOut(auth);
      await fetch("/api/auth/presencia", { method: "DELETE" });
      await fetch("/api/auth/session", { method: "DELETE" });

      setPassOk("Contrasena actualizada. Debes volver a iniciar sesion.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.location.href = "/login";
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("auth/wrong-password") || msg.includes("INVALID_LOGIN_CREDENTIALS")) {
        setPassError("La contrasena actual no es correcta.");
      } else if (msg.includes("auth/too-many-requests")) {
        setPassError("Demasiados intentos. Intenta nuevamente en unos minutos.");
      } else {
        setPassError("No se pudo actualizar la contrasena. Verifica tus datos.");
      }
    } finally {
      setPassLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {firstLetter(nombre)}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Actualiza tus datos de contacto con una vista mas clara y rapida.
              </p>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{nombre}</div>
              <div className="break-all text-sm text-slate-500 dark:text-slate-400">{email}</div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Estado</div>
            <div className="mt-1 text-sm font-medium">{defaults.estadoAcceso}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Roles</div>
            <div className="mt-1 text-sm font-medium">{roles}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Areas</div>
            <div className="mt-1 text-sm font-medium">{areas}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Documento</div>
            <div className="mt-1 text-sm font-medium">
              {defaults.tipoDoc || "-"} {defaults.nroDoc || ""}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold">Datos editables</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Puedes modificar documento, fecha de nacimiento, celular y direccion.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipo de documento</label>
              <select name="tipoDoc" defaultValue={defaults.tipoDoc || "DNI"} className="ui-select">
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Numero de documento</label>
              <input name="nroDoc" defaultValue={defaults.nroDoc} className="ui-input" placeholder="Ej: 12345678" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Celular</label>
              <input name="celular" defaultValue={defaults.celular} className="ui-input" placeholder="Ej: 999999999" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Direccion</label>
              <input name="direccion" defaultValue={defaults.direccion} className="ui-input" placeholder="Ej: Av. ..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha de nacimiento</label>
              <input name="fNacimiento" type="date" defaultValue={defaults.fNacimientoInput} className="ui-input" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Fecha de ingreso</div>
            <div className="mt-1 text-sm font-medium">{defaults.fIngreso}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Fecha de nacimiento</div>
            <div className="mt-1 text-sm font-medium">{defaults.fNacimiento}</div>
          </div>
        </section>

        {state?.ok === false ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            {state.error}
          </div>
        ) : null}

        {state?.ok === true && !pending ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            Cambios guardados correctamente.
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>

      <form
        onSubmit={onSubmitPassword}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div>
          <h2 className="text-base font-semibold">Cambiar contrasena</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Por seguridad, al cambiar la contrasena se cerrara tu sesion y deberas iniciar nuevamente.
          </p>
        </div>

        {!passwordMode ? (
          <button
            type="button"
            onClick={() => {
              setPassError(null);
              setPassOk(null);
              setPasswordMode(true);
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Cambiar contrasena
          </button>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contrasena actual</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    className="ui-input pr-10"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    aria-label={showCurrentPassword ? "Ocultar contrasena actual" : "Mostrar contrasena actual"}
                  >
                    {showCurrentPassword ? (
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nueva contrasena</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="ui-input pr-10"
                    autoComplete="new-password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setShowNewPassword((v) => !v)}
                    aria-label={showNewPassword ? "Ocultar nueva contrasena" : "Mostrar nueva contrasena"}
                  >
                    {showNewPassword ? (
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirmar nueva</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="ui-input pr-10"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Ocultar confirmacion de contrasena" : "Mostrar confirmacion de contrasena"}
                  >
                    {showConfirmPassword ? (
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
            </div>

            {passError ? (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
                {passError}
              </div>
            ) : null}

            {passOk ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                {passOk}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={passLoading}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {passLoading ? "Actualizando..." : "Actualizar contrasena"}
              </button>
              <button
                type="button"
                disabled={passLoading}
                onClick={() => {
                  setPasswordMode(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                  setPassError(null);
                  setPassOk(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
