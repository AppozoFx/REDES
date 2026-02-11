import type { ServerSession } from "@/core/auth/session";

export type NavItem = {
  key: string;
  label: string;
  href: string;
};

function hasArea(session: ServerSession, area: string) {
  return session.access.areas?.includes(area) ?? false;
}

function hasPerm(session: ServerSession, perm: string) {
  return session.permissions?.includes(perm) ?? false;
}

export function buildHomeNav(session: ServerSession): NavItem[] {
  const items: NavItem[] = [
    { key: "HOME", label: "Inicio", href: "/home" },
    { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
  ];

  if (hasArea(session, "INSTALACIONES")) {
    items.push({ key: "INSTALACIONES", label: "Instalaciones", href: "/home/instalaciones" });
  }

  if (hasArea(session, "AVERIAS")) {
    items.push({ key: "AVERIAS", label: "Averías", href: "/home/averias" });
  }

  // ? Permiso real en tu sistema
  if (hasPerm(session, "USERS_LIST")) {
    items.push({ key: "USUARIOS", label: "Usuarios", href: "/home/usuarios" });
  }

  // Zonas para no-admins con permiso específico
  if (hasPerm(session, "ZONAS_MANAGE")) {
    items.push({ key: "ZONAS", label: "Zonas", href: "/home/zonas" });
  }

  // Cuadrillas (Instalaciones) para no-admins con permiso específico
  if (hasPerm(session, "CUADRILLAS_MANAGE")) {
    items.push({ key: "CUADRILLAS", label: "Cuadrillas", href: "/home/cuadrillas" });
  }

  // Órdenes -> Importar (solo con permiso)
  if (hasPerm(session, "ORDENES_IMPORT")) {
    items.push({ key: "ORDENES_IMPORT", label: "Órdenes: Importar", href: "/home/ordenes/import" });
  }

  // Equipos -> Importar (solo con permiso)
  if (hasPerm(session, "EQUIPOS_IMPORT")) {
    items.push({ key: "EQUIPOS_IMPORT", label: "Equipos: Importar", href: "/home/equipos/import" });
  }

  // Materiales: si tiene vista o creación, apuntar a listado
  if (hasPerm(session, "MATERIALES_CREATE") || hasPerm(session, "MATERIALES_VIEW")) {
    items.push({ key: "MATERIALES", label: "Materiales", href: "/home/materiales" });
  }

  // Transferencias (INSTALACIONES): si tiene algún permiso de despacho o devolución
  if (
    hasPerm(session, "EQUIPOS_DESPACHO") ||
    hasPerm(session, "MATERIALES_TRANSFER_SERVICIO") ||
    hasPerm(session, "EQUIPOS_DEVOLUCION") ||
    hasPerm(session, "MATERIALES_DEVOLUCION")
  ) {
    items.push({ key: "TR_INST_DESP", label: "Despacho (Inst)", href: "/home/transferencias/instalaciones/despacho" });
    items.push({ key: "TR_INST_DEV", label: "Devoluciones (Inst)", href: "/home/transferencias/instalaciones/devoluciones" });
  }
  if (hasPerm(session, "EQUIPOS_VIEW") || hasPerm(session, "EQUIPOS_EDIT")) {
    items.push({ key: "TR_INST_EQ", label: "Equipos (Inst)", href: "/home/transferencias/instalaciones/equipos" });
  }

  // Ventas
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
