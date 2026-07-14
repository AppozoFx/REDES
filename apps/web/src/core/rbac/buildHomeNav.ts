import type { ServerSession } from "@/core/auth/session";

export type NavItem = {
  key: string;
  label: string;
  href: string;
};

const PERM_GERENCIA_COORDINADORES = "GERENCIA_COORDINADORES";
const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";
const PERM_SUPERVISORES_VIEW = "SUPERVISORES_VIEW";
const PERM_SUPERVISORES_MANAGE = "SUPERVISORES_MANAGE";

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
  const isPriv = roles.includes("GERENCIA") || roles.includes("JEFATURA") || roles.includes("ALMACEN") || roles.includes("RRHH") || roles.includes("SUPERVISOR") || roles.includes("SEGURIDAD");
  const isGerencia = roles.includes("GERENCIA");
  const isJefatura = roles.includes("JEFATURA");
  const isRrhh = roles.includes("RRHH");
  const isSupervisor = roles.includes("SUPERVISOR");
  const isSeguridad = roles.includes("SEGURIDAD");
  const hasInstArea = hasArea(session, "INSTALACIONES");

  if (isGestor && !session.isAdmin && !isPriv) {
    const items: NavItem[] = [
      { key: "HOME", label: "Inicio", href: "/home" },
      { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
      { key: "STATUS", label: "Sala de estado", href: "/home/status" },
      { key: "INSTALACIONES_ASISTENCIA", label: "Asistencia Cuadrillas", href: "/home/instalaciones/asistencia" },
      { key: "CUADRILLAS_GESTION", label: "Cuadrillas Gestion", href: "/home/cuadrillas/gestion" },
      { key: "TECNICOS_GESTION", label: "Tecnicos Gestion", href: "/home/tecnicos/gestion" },
    ];

    if (hasPerm(session, "CUADRILLAS_CIERRE_WINBO")) {
      items.push({ key: "CUADRILLAS_CIERRE_WINBO", label: "Cierre Cuadrilla", href: "/home/cuadrillas/cierre-winbo" });
    }

    if (hasPerm(session, "ORDENES_IMPORT")) {
      items.push({ key: "ORDENES_IMPORT", label: "Ordenes: Importar", href: "/home/ordenes/import" });
    }
    if (hasPerm(session, "ORDENES_LLAMADAS_VIEW") || hasPerm(session, "ORDENES_LLAMADAS_EDIT") || isCoord) {
      items.push({ key: "ORDENES_CALLS", label: "Ordenes: Llamadas", href: "/home/ordenes/llamadas" });
    }
    if (hasPerm(session, "ORDENES_LIQUIDAR") || isCoord) {
      items.push({ key: "ORDENES_PLANTILLAS", label: "Ordenes: Plantillas", href: "/home/ordenes/plantillas" });
    }
    if (hasPerm(session, "ORDENES_MAPA_VIEW") || roles.includes("COORDINADOR")) {
      items.push({ key: "ORDENES_MAPA", label: "Ordenes: Mapa", href: "/home/ordenes/mapa" });
    }
    if (hasPerm(session, "ORDENES_GARANTIAS_VIEW") || hasPerm(session, "ORDENES_GARANTIAS_EDIT") || isGerencia || isSupervisor) {
      items.push({ key: "ORDENES_GARANTIAS", label: "Garantias", href: "/home/garantias" });
    }
    if (hasArea(session, "MANTENIMIENTO")) {
      items.push({ key: "MANT_LIQ", label: "Mantenimiento: Liquidaciones", href: "/home/mantenimiento/liquidaciones" });
    }

    return items;
  }

  const items: NavItem[] = [
    { key: "HOME", label: "Inicio", href: "/home" },
    { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
    { key: "STATUS", label: "Sala de estado", href: "/home/status" },
  ];

  if (hasArea(session, "INSTALACIONES") || isCoord || isRrhh || isSupervisor || isSeguridad) {
    const roles = (session.access.roles ?? []).map((r) => String(r || "").toUpperCase());
    const canAsistenciaResumen =
      session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA") || roles.includes("ALMACEN") || roles.includes("RRHH") || roles.includes("SUPERVISOR") || roles.includes("SEGURIDAD");
    const coordOnly = isCoord && !isPriv && !session.isAdmin && !isGestor;

    items.push({ key: "INSTALACIONES", label: "Instalaciones", href: "/home/instalaciones" });

    if (!coordOnly) {
      if (session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA") || hasPerm(session, "ORDENES_LIQUIDAR")) {
        items.push({
          key: "INSTALACIONES_DASHBOARD",
          label: "Instalaciones: Dashboard",
          href: "/home/instalaciones/dashboard",
        });
      }
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
        key: "INSTALACIONES_ACTAS_DIA",
        label: "Instalaciones: Actas por dia",
        href: "/home/instalaciones/actas-dia",
      });
      if (!isJefatura) {
        items.push({
          key: "INSTALACIONES_ACTAS",
          label: "Recepcion de Actas",
          href: "/home/instalaciones/actas",
        });
      }
      items.push({
        key: "INSTALACIONES_ASISTENCIA",
        label: "Asistencia Cuadrillas",
        href: "/home/instalaciones/asistencia",
      });
    }

    if (roles.includes("GERENCIA") || roles.includes("JEFATURA") || roles.includes("COORDINADOR")) {
      items.push({
        key: "INSTALACIONES_ASIST_PROG",
        label: "Asistencia Programada",
        href: "/home/instalaciones/asistencia-programada",
      });
    }
    if (roles.includes("GERENCIA") || roles.includes("JEFATURA")) {
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
    if (session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA") || roles.includes("ALMACEN") || roles.includes("RRHH")) {
      items.push({
        key: "GESTOR_JORNADAS",
        label: "Jornadas: Gestores",
        href: "/home/rrhh/gestor-jornadas",
      });
    }
    if (session.isAdmin || isGerencia || isJefatura || isRrhh || hasPerm(session, "SUPERVISORES_ASISTENCIA_VIEW")) {
      items.push({
        key: "SUPERVISORES_ASISTENCIA",
        label: "Asistencia Supervisores",
        href: "/home/supervisores/asistencia",
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
    if (hasPerm(session, "CUADRILLAS_CIERRE_WINBO")) {
      items.push({
        key: "CUADRILLAS_CIERRE_WINBO",
        label: "Cierre Cuadrilla",
        href: "/home/cuadrillas/cierre-winbo",
      });
    }
  }

  if (hasPerm(session, "ORDENES_GARANTIAS_VIEW") || hasPerm(session, "ORDENES_GARANTIAS_EDIT") || isGerencia || isSupervisor) {
    items.push({ key: "GARANTIAS", label: "Garantias", href: "/home/garantias" });
    items.push({
      key: "GARANTIAS_DASHBOARD",
      label: "Garantias: Dashboard",
      href: "/home/garantias/dashboard",
    });
    items.push({
      key: "GARANTIAS_CRUCE",
      label: "Garantias: Cruce",
      href: "/home/garantias/cruce",
    });
    items.push({
      key: "GARANTIAS_CRUCE_CARGA",
      label: "Garantias: Cargar Excel",
      href: "/home/garantias/cruce/cargas",
    });
  }

  if (hasPerm(session, "ORDENES_IMPORT")) {
    items.push({ key: "ORDENES_IMPORT", label: "Ordenes: Importar", href: "/home/ordenes/import" });
  }
  if (hasPerm(session, "ORDENES_LLAMADAS_VIEW") || hasPerm(session, "ORDENES_LLAMADAS_EDIT") || isCoord) {
    items.push({ key: "ORDENES_CALLS", label: "Ordenes: Llamadas", href: "/home/ordenes/llamadas" });
  }
  if (hasPerm(session, "ORDENES_LIQUIDAR")) {
    items.push({ key: "ORDENES_LIQ", label: "Ordenes: Liquidacion", href: "/home/ordenes/liquidacion" });
  }
  if (hasPerm(session, "ORDENES_LIQUIDAR") || isCoord) {
    items.push({ key: "ORDENES_PLANTILLAS", label: "Ordenes: Plantillas", href: "/home/ordenes/plantillas" });
  }
  if (hasPerm(session, "ORDENES_MAPA_VIEW") || roles.includes("COORDINADOR")) {
    items.push({ key: "ORDENES_MAPA", label: "Ordenes: Mapa", href: "/home/ordenes/mapa" });
  }
  if (hasPerm(session, "INCONCERT_IMPORT")) {
    items.push({ key: "INCONCERT_IMPORT", label: "InConcert: Importar", href: "/home/inconcert/importar" });
  }
  if (hasPerm(session, "INCONCERT_GERENCIA_VIEW") || hasPerm(session, "INCONCERT_GERENCIA_EDIT")) {
    items.push({ key: "INCONCERT_GERENCIA", label: "InConcert: Gerencia", href: "/home/inconcert/gerencia" });
  }

  if (hasPerm(session, "USERS_LIST")) {
    items.push({ key: "USUARIOS", label: "Usuarios", href: "/home/usuarios" });
  }

  if (session.isAdmin || isGerencia || isJefatura || hasPerm(session, PERM_SUPERVISORES_VIEW) || hasPerm(session, PERM_SUPERVISORES_MANAGE)) {
    items.push({ key: "SUPERVISORES", label: "Supervisores", href: "/home/supervisores" });
    items.push({
      key: "SUPERVISION_ASIG_SUP",
      label: "Asignacion por Zonas",
      href: "/home/instalaciones/asignacion-supervisores",
    });
    items.push({
      key: "SUPERVISION_DIST_ZONAS",
      label: "Distribucion por Zonas",
      href: "/home/instalaciones/distribucion-zonas",
    });
  }

  if (session.isAdmin || isJefatura || (isGerencia && hasPerm(session, PERM_GERENCIA_COORDINADORES))) {
    items.push({
      key: "GERENCIA_COORDINADORES",
      label: "Gerencia: Coordinadores",
      href: "/home/gerencia/coordinadores",
    });
  }

  if (session.isAdmin || (isGerencia && hasPerm(session, PERM_GERENCIA_ORDEN_COMPRA))) {
    items.push({
      key: "GERENCIA_ORDEN_COMPRA",
      label: "Gerencia: Orden de Compra",
      href: "/home/gerencia/orden-compra",
    });
    items.push({
      key: "GERENCIA_ORDENES_COMPRA_MES",
      label: "Gerencia: OC por Mes",
      href: "/home/gerencia/ordenes-compra",
    });
  }

  if (session.isAdmin || isGerencia || isJefatura) {
    items.push({
      key: "GERENCIA_VALIDACION_WIN",
      label: "Gerencia: VALIDACION WIN",
      href: "/home/gerencia/validacion-win",
    });
  }

  if (hasPerm(session, "ZONAS_MANAGE")) {
    items.push({ key: "ZONAS", label: "Zonas", href: "/home/zonas" });
  }

  if (hasPerm(session, "CUADRILLAS_MANAGE")) {
    items.push({ key: "CUADRILLAS", label: "Cuadrillas", href: "/home/cuadrillas" });
  }
  if (hasPerm(session, "CUADRILLAS_MANAGE") && hasArea(session, "MANTENIMIENTO")) {
    items.push({ key: "CUADRILLAS_MANT", label: "Cuadrillas (Mant)", href: "/home/mantenimiento/cuadrillas" });
  }
  if (hasArea(session, "MANTENIMIENTO")) {
    items.push({ key: "MANT_LIQ", label: "Mantenimiento: Liquidaciones", href: "/home/mantenimiento/liquidaciones" });
  }

  if (!isJefatura && hasPerm(session, "EQUIPOS_IMPORT")) {
    items.push({ key: "EQUIPOS_IMPORT", label: "Importar Equipos", href: "/home/equipos/import" });
  }

  if (hasPerm(session, "MATERIALES_CREATE") || hasPerm(session, "MATERIALES_VIEW")) {
    items.push({ key: "MATERIALES", label: "Catálogo de Materiales", href: "/home/materiales" });
  }

  if (
    !isJefatura &&
    (
      hasPerm(session, "EQUIPOS_DESPACHO") ||
      hasPerm(session, "MATERIALES_TRANSFER_SERVICIO") ||
      hasPerm(session, "EQUIPOS_DEVOLUCION") ||
      hasPerm(session, "MATERIALES_DEVOLUCION")
    )
  ) {
    items.push({ key: "TR_INST_DESP", label: "Despacho a Cuadrilla", href: "/home/transferencias/instalaciones/despacho" });
    items.push({ key: "TR_INST_DEV", label: "Devoluciones de Cuadrilla", href: "/home/transferencias/instalaciones/devoluciones" });
    items.push({ key: "TR_INST_REP", label: "Reposición", href: "/home/transferencias/instalaciones/reposicion" });
    items.push({ key: "TR_INST_TEC_MAT", label: "Materiales a Técnico", href: "/home/transferencias/instalaciones/tecnicos-materiales" });
    if (hasPerm(session, "EQUIPOS_DESPACHO") || hasPerm(session, "MATERIALES_TRANSFER_SERVICIO")) {
      items.push({ key: "TR_INST_DESP_PERS", label: "Despacho a Personal", href: "/home/transferencias/instalaciones/despacho-personal" });
    }
    if (hasPerm(session, "EQUIPOS_DEVOLUCION") || hasPerm(session, "MATERIALES_DEVOLUCION")) {
      items.push({ key: "TR_INST_DEV_PERS", label: "Devoluciones de Personal", href: "/home/transferencias/instalaciones/devoluciones-personal" });
    }
    if (hasPerm(session, "MATERIALES_TRANSFER_SERVICIO")) {
      items.push({ key: "TR_INST_TRSF_INT", label: "Transferir entre Entidades", href: "/home/transferencias/instalaciones/transferencias-internas" });
    }
  }
  if (
    hasArea(session, "MANTENIMIENTO") &&
    (hasPerm(session, "MATERIALES_TRANSFER_SERVICIO") || hasPerm(session, "MATERIALES_DEVOLUCION") || hasPerm(session, "MATERIALES_VIEW"))
  ) {
    items.push({
      key: "TR_MANT_DESP",
      label: "Despacho (Mant)",
      href: "/home/transferencias/mantenimiento/despacho",
    });
    items.push({
      key: "TR_MANT_DEV",
      label: "Devolucion (Mant)",
      href: "/home/transferencias/mantenimiento/devolucion",
    });
    items.push({
      key: "TR_MANT_STOCK",
      label: "Stock Cuadrillas (Mant)",
      href: "/home/transferencias/mantenimiento/stock-cuadrillas",
    });
    items.push({
      key: "TR_MANT_TEC_MAT",
      label: "Materiales Tecnicos (Mant)",
      href: "/home/transferencias/mantenimiento/tecnicos-materiales",
    });
  }
  if (!isJefatura && (hasPerm(session, "EQUIPOS_VIEW") || hasPerm(session, "EQUIPOS_EDIT"))) {
    items.push({ key: "TR_INST_EQ", label: "Equipos", href: "/home/transferencias/instalaciones/equipos" });
    items.push({ key: "TR_INST_STOCK_PERS", label: "Stock Personal", href: "/home/transferencias/instalaciones/stock-personal" });
  }
  if (
    isJefatura ||
    hasArea(session, "INSTALACIONES") ||
    hasPerm(session, "EQUIPOS_VIEW") ||
    hasPerm(session, "EQUIPOS_EDIT")
  ) {
    items.push({ key: "TR_INST_STOCK_EQ", label: "Stock de Equipos", href: "/home/transferencias/instalaciones/stock-equipos" });
    items.push({ key: "TR_INST_PREDESP", label: "Predespacho", href: "/home/transferencias/instalaciones/predespacho" });
    items.push({ key: "TR_INST_AUD", label: "Auditoría", href: "/home/transferencias/instalaciones/auditoria" });
  }

  if (hasPerm(session, "VENTAS_VER") || hasPerm(session, "VENTAS_VER_ALL")) {
    items.push({ key: "VENTAS", label: "Ventas", href: "/home/ventas" });
  }
  if (hasPerm(session, "VENTAS_DESPACHO_INST")) {
    items.push({ key: "VENTAS_INST", label: "Ventas: Despacho", href: "/home/ventas/instalaciones/despacho" });
  }
  if (hasPerm(session, "VENTAS_DESPACHO_MANT")) {
    items.push({ key: "VENTAS_MANT", label: "Ventas: Despacho (Mantenimiento)", href: "/home/ventas/mantenimiento/despacho" });
  }

  if ((isRrhh || isSupervisor || isSeguridad) && !session.isAdmin) {
    const limitedAllowed = new Set([
      "/home",
      "/home/comunicados",
      "/home/status",
      "/home/instalaciones/dashboard",
      "/home/instalaciones/asignacion-supervisores",
      "/home/instalaciones/distribucion-zonas",
      "/home/instalaciones/asistencia/resumen",
      "/home/rrhh/gestor-jornadas",
      "/home/cuadrillas/gestion",
      "/home/tecnicos/gestion",
      "/home/usuarios",
      "/home/supervisores",
      "/home/supervisores/asistencia",
      "/home/garantias/dashboard",
      "/home/garantias/cruce",
      "/home/garantias/cruce/cargas",
      "/home/garantias",
      ...((isSupervisor || isSeguridad) ? ["/home/ordenes/mapa"] : []),
    ]);
    return items.filter((item) => limitedAllowed.has(item.href));
  }

  return items;
}
