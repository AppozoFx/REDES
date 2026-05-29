import { getDefaultRoleForRoles } from "@/core/rbac/homeRoute";
import { listPendingComunicadosForUser, markComunicadoSeen } from "@/domain/comunicados/service";
import type { MobileAuthContext } from "./mobile";
import { getMobileProfile } from "./mobile";

function getPersistencia(comunicado: any): "ONCE" | "ALWAYS" {
  const value = String(comunicado?.persistencia ?? "ONCE").toUpperCase();
  return value === "ALWAYS" ? "ALWAYS" : "ONCE";
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
}

export type MobileBootstrapComunicado = {
  id: string;
  titulo: string;
  cuerpo: string;
  obligatorio: boolean;
  persistencia: "ONCE" | "ALWAYS";
  placement: "PAGE" | "TOP_BANNER" | "BOTH";
  target: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  visibleDesde: string | null;
  visibleHasta: string | null;
};

function toMobileComunicado(comunicado: any): MobileBootstrapComunicado | null {
  const id = String(comunicado?.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    titulo: String(comunicado?.titulo ?? "").trim(),
    cuerpo: String(comunicado?.cuerpo ?? "").trim(),
    obligatorio: Boolean(comunicado?.obligatorio),
    persistencia: getPersistencia(comunicado),
    placement: String(comunicado?.placement ?? "PAGE").toUpperCase() === "TOP_BANNER"
      ? "TOP_BANNER"
      : String(comunicado?.placement ?? "PAGE").toUpperCase() === "BOTH"
        ? "BOTH"
        : "PAGE",
    target: String(comunicado?.target ?? "ALL").toUpperCase(),
    imageUrl: String(comunicado?.imageUrl ?? "").trim() || null,
    linkUrl: String(comunicado?.linkUrl ?? "").trim() || null,
    linkLabel: String(comunicado?.linkLabel ?? "").trim() || null,
    visibleDesde: toIso(comunicado?.visibleDesde),
    visibleHasta: toIso(comunicado?.visibleHasta),
  };
}

export async function buildMobileBootstrap(mobile: MobileAuthContext) {
  const profile = await getMobileProfile(mobile.uid);
  const pending = await listPendingComunicadosForUser({
    uid: mobile.uid,
    email: mobile.email,
    isAdmin: mobile.access.roles.includes("ADMIN"),
    access: {
      roles: mobile.access.roles || [],
      areas: mobile.access.areas || [],
    },
    permissions: mobile.access.effectivePermissions || [],
  } as any);

  const comunicados = pending
    .map(toMobileComunicado)
    .filter(Boolean) as MobileBootstrapComunicado[];

  const roles = (mobile.access.roles || []).map((role) => String(role || "").trim().toUpperCase()).filter(Boolean);
  const defaultRole = getDefaultRoleForRoles(roles);
  const requiresComunicadosGate = comunicados.some(
    (item) => item.obligatorio && item.persistencia === "ONCE"
  );

  return {
    session: {
      uid: mobile.uid,
      email: mobile.email || null,
      nombre: profile.nombre,
      nombreCorto: profile.nombreCorto,
      roles,
      areas: mobile.access.areas || [],
      permissions: mobile.access.effectivePermissions || [],
      estadoAcceso: mobile.access.estadoAcceso || "INHABILITADO",
      isAdmin: roles.includes("ADMIN"),
    },
    comunicados,
    requiresComunicadosGate,
    roleSelectionRequired: roles.length > 1,
    defaultRole,
  };
}

export async function markMobileComunicadoSeen(uid: string, comunicadoId: string) {
  await markComunicadoSeen(uid, comunicadoId);
}
