export type PermissionEstado = "ACTIVO" | "INACTIVO";

export type Permission = {
  id: string;
  nombre: string;
  descripcion?: string;
  modulo: string; // ej: "USUARIOS", "ROLES", "MODULOS"
  estado: PermissionEstado;
  audit: {
    createdAt: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy?: string;
    deletedAt?: unknown;
    deletedBy?: string;
  };
  permissions: string[];

};
