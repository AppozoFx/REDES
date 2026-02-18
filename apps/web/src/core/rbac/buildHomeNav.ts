import type { ServerSession } from "@/core/auth/session";

export type NavItem = {
  key: string;
  label: string;
  href: string;
};

function hasArea(session: ServerSession, area: string) {
  return session.isAdmin || (session.access.areas?.includes(area) ?? false);
}

function hasPerm(session: ServerSession, perm: string) {
  return session.isAdmin || (session.permissions?.includes(perm) ?? false);
}

export function buildHomeNav(session: ServerSession): NavItem[] {
  const roles = (session.access.roles ?? []).map((r) => String(r || "").toUpperCase());
  const isGestor = roles.includes("GESTOR");
  const isCoord = roles.includes("COORDINADOR");
  const isPriv = roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

  if (isGestor && !session.isAdmin && !isPriv) {
    const items: NavItem[] = [
      { key: "HOME", label: "Inicio", href: "/home" },
      { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
      { key: "INSTALACIONES_ASISTENCIA", label: "Asistencia Cuadrillas", href: "/home/instalaciones/asistencia" },
      { key: "CUADRILLAS_GESTION", label: "Cuadrillas Gestion", href: "/home/cuadrillas/gestion" },
      { key: "TECNICOS_GESTION", label: "Tecnicos Gestion", href: "/home/tecnicos/gestion" },
    ];

    if (hasPerm(session, "ORDENES_IMPORT")) {
      items.push({ key: "ORDENES_IMPORT", label: "Ordenes: Importar", href: "/home/ordenes/import" });
    }
    if (hasPerm(session, "ORDENES_LLAMADAS_VIEW") || hasPerm(session, "ORDENES_LLAMADAS_EDIT")) {
      items.push({ key: "ORDENES_CALLS", label: "Ordenes: Llamadas", href: "/home/ordenes/llamadas" });
    }
    if (hasPerm(session, "ORDENES_MAPA_VIEW")) {
      items.push({ key: "ORDENES_MAPA", label: "Ordenes: Mapa", href: "/home/ordenes/mapa" });
    }
    if (hasPerm(session, "ORDENES_GARANTIAS_VIEW") || hasPerm(session, "ORDENES_GARANTIAS_EDIT")) {
      items.push({ key: "ORDENES_GARANTIAS", label: "Ordenes: Garantias", href: "/home/ordenes/garantias" });
    }

    items.push({ key: "PERFIL", label: "Mi perfil", href: "/home/perfil" });
    return items;
  }

  const items: NavItem[] = [
    { key: "HOME", label: "Inicio", href: "/home" },
    { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
  ];

  if (hasArea(session, "INSTALACIONES")) {
    const roles = (session.access.roles ?? []).map((r) => String(r || "").toUpperCase());
    const canAsistenciaResumen =
      session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");
    const coordOnly = isCoord && !isPriv && !session.isAdmin && !isGestor;

    if (!coordOnly) {
      items.push({ key: "INSTALACIONES", label: "Instalaciones", href: "/home/instalaciones" });
      items.push({
        key: "INSTALACIONES_MAT",
        label: "Instalaciones: Materiales",
        href: "/home/instalaciones/materiales",
      });
      items.push({
        key: "INSTALACIONES_DET",
        label: "Instalaciones: Detalle",
        href: "/home/instalaciones/detalle",
      });
      items.push({
        key: "INSTALACIONES_ACTAS",
        label: "Recepcion de Actas",
        href: "/home/instalaciones/actas",
      });
      items.push({
        key: "INSTALACIONES_ASISTENCIA",
        label: "Asistencia Cuadrillas",
        href: "/home/instalaciones/asistencia",
      });
    }

    if (roles.includes("GERENCIA") || roles.includes("COORDINADOR")) {
      items.push({
        key: "INSTALACIONES_ASIST_PROG",
        label: "Asistencia Programada",
        href: "/home/instalaciones/asistencia-programada",
      });
    }
    if (roles.includes("GERENCIA")) {
      items.push({
        key: "INSTALACIONES_ASIG_GEST",
        label: "Asignacion de Gestores",
        href: "/home/instalaciones/asignacion-gestores",
      });
    }
    if (canAsistenciaResumen) {
      items.push({
        key: "INSTALACIONES_ASISTENCIA_RESUMEN",
        label: "Asistencia: Resumen",
        href: "/home/instalaciones/asistencia/resumen",
      });
    }
    items.push({
      key: "CUADRILLAS_GESTION",
      label: "Cuadrillas Gestion",
      href: "/home/cuadrillas/gestion",
    });
    items.push({
      key: "TECNICOS_GESTION",
      label: "Tecnicos Gestion",
      href: "/home/tecnicos/gestion",
    });
  }

  if (hasArea(session, "AVERIAS")) {
    items.push({ key: "AVERIAS", label: "Averias", href: "/home/averias" });
  }

  if (hasPerm(session, "USERS_LIST")) {
    items.push({ key: "USUARIOS", label: "Usuarios", href: "/home/usuarios" });
  }

  if (hasPerm(session, "ZONAS_MANAGE")) {
    items.push({ key: "ZONAS", label: "Zonas", href: "/home/zonas" });
  }

  if (hasPerm(session, "CUADRILLAS_MANAGE")) {
    items.push({ key: "CUADRILLAS", label: "Cuadrillas", href: "/home/cuadrillas" });
  }

  if (hasPerm(session, "ORDENES_IMPORT")) {
    items.push({ key: "ORDENES_IMPORT", label: "Ordenes: Importar", href: "/home/ordenes/import" });
  }
  if (hasPerm(session, "ORDENES_LLAMADAS_VIEW") || hasPerm(session, "ORDENES_LLAMADAS_EDIT")) {
    items.push({ key: "ORDENES_CALLS", label: "Ordenes: Llamadas", href: "/home/ordenes/llamadas" });
  }
  if (hasPerm(session, "ORDENES_LIQUIDAR")) {
    items.push({ key: "ORDENES_LIQ", label: "Ordenes: Liquidacion", href: "/home/ordenes/liquidacion" });
  }
  if (hasPerm(session, "ORDENES_MAPA_VIEW")) {
    items.push({ key: "ORDENES_MAPA", label: "Ordenes: Mapa", href: "/home/ordenes/mapa" });
  }
  if (hasPerm(session, "ORDENES_GARANTIAS_VIEW") || hasPerm(session, "ORDENES_GARANTIAS_EDIT")) {
    items.push({ key: "ORDENES_GARANTIAS", label: "Ordenes: Garantias", href: "/home/ordenes/garantias" });
  }
  if (hasPerm(session, "INCONCERT_IMPORT")) {
    items.push({ key: "INCONCERT_IMPORT", label: "InConcert: Importar", href: "/home/inconcert/importar" });
  }
  if (hasPerm(session, "INCONCERT_GERENCIA_VIEW") || hasPerm(session, "INCONCERT_GERENCIA_EDIT")) {
    items.push({ key: "INCONCERT_GERENCIA", label: "InConcert: Gerencia", href: "/home/inconcert/gerencia" });
  }

  if (hasPerm(session, "EQUIPOS_IMPORT")) {
    items.push({ key: "EQUIPOS_IMPORT", label: "Equipos: Importar", href: "/home/equipos/import" });
  }

  if (hasPerm(session, "MATERIALES_CREATE") || hasPerm(session, "MATERIALES_VIEW")) {
    items.push({ key: "MATERIALES", label: "Materiales", href: "/home/materiales" });
  }

  if (
    hasPerm(session, "EQUIPOS_DESPACHO") ||
    hasPerm(session, "MATERIALES_TRANSFER_SERVICIO") ||
    hasPerm(session, "EQUIPOS_DEVOLUCION") ||
    hasPerm(session, "MATERIALES_DEVOLUCION")
  ) {
    items.push({ key: "TR_INST_DESP", label: "Despacho (Inst)", href: "/home/transferencias/instalaciones/despacho" });
    items.push({ key: "TR_INST_DEV", label: "Devoluciones (Inst)", href: "/home/transferencias/instalaciones/devoluciones" });
    items.push({ key: "TR_INST_REP", label: "Reposicion (Inst)", href: "/home/transferencias/instalaciones/reposicion" });
    items.push({ key: "TR_INST_TEC_MAT", label: "Materiales Tecnicos (Inst)", href: "/home/transferencias/instalaciones/tecnicos-materiales" });
  }
  if (hasPerm(session, "EQUIPOS_VIEW") || hasPerm(session, "EQUIPOS_EDIT")) {
    items.push({ key: "TR_INST_EQ", label: "Equipos (Inst)", href: "/home/transferencias/instalaciones/equipos" });
  }
  if (
    hasArea(session, "INSTALACIONES") ||
    hasPerm(session, "EQUIPOS_VIEW") ||
    hasPerm(session, "EQUIPOS_EDIT")
  ) {
    items.push({ key: "TR_INST_STOCK_EQ", label: "Stock Equipos (Inst)", href: "/home/transferencias/instalaciones/stock-equipos" });
  }

  if (hasPerm(session, "VENTAS_VER") || hasPerm(session, "VENTAS_VER_ALL")) {
    items.push({ key: "VENTAS", label: "Ventas", href: "/home/ventas" });
  }
  if (hasPerm(session, "VENTAS_DESPACHO_INST")) {
    items.push({ key: "VENTAS_INST", label: "Ventas: Despacho (Inst)", href: "/home/ventas/instalaciones/despacho" });
  }
  if (hasPerm(session, "VENTAS_DESPACHO_AVER")) {
    items.push({ key: "VENTAS_AVER", label: "Ventas: Despacho (AVERIAS)", href: "/home/ventas/averias/despacho" });
  }

  items.push({ key: "PERFIL", label: "Mi perfil", href: "/home/perfil" });

  return items;
}
