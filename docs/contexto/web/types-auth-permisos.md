# Tipos compartidos y contratos de usuario/permisos - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Esta unidad documenta los tipos y contratos usados para perfil, acceso, roles, areas, permisos, sesion web, bootstrap mobile y navegacion RBAC.

## Alcance Leido

- `apps/web/src/types/auth.ts`
- `apps/web/src/types/permissions.ts`
- `apps/web/src/types/usuarios.ts`
- `apps/web/src/core/auth/accessContext.ts`
- `apps/web/src/core/auth/accessContext.cached.ts`
- `apps/web/src/core/auth/session.ts`
- `apps/web/src/core/auth/guards.ts`
- `apps/web/src/core/auth/apiGuards.ts`
- `apps/web/src/core/auth/mobile.ts`
- `apps/web/src/core/auth/mobileBootstrap.ts`
- `apps/web/src/core/rbac/homeRoute.ts`
- `apps/web/src/core/rbac/buildHomeNav.ts`
- `apps/web/src/core/rbac/buildAdminNav.ts`
- `apps/web/src/core/rbac/menu.ts`
- `apps/web/src/lib/rbac.ts`
- `apps/web/src/domain/usuarios/schema.ts`
- `apps/web/src/domain/usuarios/repo.ts`
- `apps/web/src/domain/usuarios/service.ts`
- `apps/web/src/domain/roles/repo.ts`
- `apps/web/src/domain/roles/schema.ts`
- `apps/web/src/domain/permissions/permission.schema.ts`
- `apps/web/src/domain/permissions/permissions.repo.ts`
- rutas admin de usuarios y auth por busqueda puntual.

No se ejecuto la app, tests, emuladores ni escrituras contra Firestore.

## Mapa De Contratos

Hay cuatro capas distintas:

1. Tipos livianos en `apps/web/src/types`.
2. Schemas Zod y repos por dominio en `apps/web/src/domain`.
3. Contexto de acceso/sesion en `apps/web/src/core/auth`.
4. Navegacion/guards RBAC en `apps/web/src/core/rbac` y paginas/API.

`src/types` no es la unica fuente de verdad. Los contratos mas importantes viven cerca del dominio y de auth.

## Tipos En `src/types`

### `types/auth.ts`

Define `UserAccess`:

- `uid`
- `isAdmin`
- `roles`
- `areas`

Uso observado: `lib/rbac.ts`. Es un helper simple para evaluar roles/areas, pero no modela permisos ni `estadoAcceso`.

### `types/permissions.ts`

Define:

- `PermissionEstado = "ACTIVO" | "INACTIVO"`
- `Permission`

Observacion: el tipo `Permission` incluye un campo `permissions: string[]`, que no coincide con el schema de creacion/edicion de permisos (`PermissionCreateSchema`) ni con el repositorio de permissions, donde un permiso individual tiene `id`, `nombre`, `descripcion`, `modulo`, `estado` y `audit`. Ese campo parece sobrante o heredado.

### `types/usuarios.ts`

Define `UsuarioPerfil`, separado de acceso:

- datos de identidad (`nombres`, `apellidos`, `displayName`);
- documento;
- contacto;
- email;
- genero/nacionalidad;
- fechas string `YYYY-MM-DD` para UI/DTO;
- `estadoPerfil`;
- campos operativos opcionales (`sede`, `cargo`, `cuadrillaId`, `supervisorUid`).

No incluye roles, areas, permisos ni `estadoAcceso`.

## Colecciones Canonicas

### `usuarios`

Perfil humano/operativo. Se valida principalmente con schemas de `domain/usuarios/schema.ts`.

### `usuarios_access`

Acceso y RBAC por usuario:

- `roles`
- `areas`
- `permissions`
- `estadoAcceso`

Este documento alimenta `AccessContext`.

### `roles`

Catalogo de roles. `RoleDoc` incluye:

- `id`
- `nombre`
- `descripcion`
- `estado`
- `permissions`
- `areasDefault`
- `audit`

`getRolesByIds` lee roles para calcular permisos efectivos. Roles inactivos no aportan permisos en `getUserAccessContext`.

### `permissions`

Catalogo de permisos. `PermissionIdSchema` exige `A-Z`, `0-9` y `_`. El repo lista activos/inactivos y permite crear, actualizar, deshabilitar y habilitar permisos.

## AccessContext

`core/auth/accessContext.ts` define `AccessContext`:

- `uid`
- `roles`
- `areas`
- `directPermissions`
- `rolePermissions`
- `effectivePermissions`
- `estadoAcceso`

Reglas:

- Lee `usuarios_access/{uid}`.
- Normaliza `estadoAcceso`: acepta `HABILITADO` y tambien historico `ACTIVO` como habilitado.
- Lee `roles/{id}` para sumar permisos por rol.
- Ignora permisos de roles con `estado != ACTIVO`.
- `effectivePermissions = rolePermissions + directPermissions` sin duplicados.

Este es el contrato canonico de permisos efectivos.

## Cache De AccessContext

`accessContext.cached.ts`:

- En desarrollo llama directo a `getUserAccessContext`.
- En produccion combina `react/cache` por request y cache TTL propia.
- TTL default: `ACCESS_CONTEXT_CACHE_TTL_MS` o `60000`.
- Max entradas: 500.
- Expone `invalidateUserAccessContext(uid?)`.

Riesgo: la invalidacion existe, pero no se observo uso directo en las acciones de admin usuarios durante la busqueda. Cambios de roles/permisos pueden tardar hasta 60 segundos en reflejarse en produccion, salvo `forceRefresh`.

## ServerSession

`core/auth/session.ts` define `ServerSession`:

- `uid`
- `access.roles`
- `access.areas`
- `access.permissions`
- `access.estadoAcceso`
- `isAdmin`
- `permissions`

Distincion critica:

- `session.access.permissions` = permisos directos del documento `usuarios_access`.
- `session.permissions` = permisos efectivos (`rolePermissions + directPermissions`).

Los guards y navegacion deben usar `session.permissions` cuando buscan permisos reales. `session.access.permissions` sirve para inspeccionar permisos directos.

`getServerSession` tambien:

- Verifica cookie `__session` con Firebase Admin.
- Lee `usuarios_presencia/{uid}` y corta sesion si `lastSeenAt/updatedAt` supera 2 horas.
- Lee `AccessContext` cacheado.
- Calcula `isAdmin` si `roles` incluye `ADMIN`.
- Tiene logs/metrica de sesion controlados por flags/env.

## Guards Web Y API

`guards.ts`:

- `requireAuth`: exige sesion y `estadoAcceso == HABILITADO`.
- `requireAdmin`: exige admin.
- `requireArea`: permite admin o area directa.
- `requirePermission`: permite admin o permiso efectivo, pero redirige a `/admin` si falla.

`apiGuards.ts`:

- Lanza errores string (`UNAUTHENTICATED`, `ACCESS_DISABLED`, `FORBIDDEN`, `AREA_FORBIDDEN`).
- `requirePermission` usa permisos efectivos.
- `requireAreaScope` normaliza areas a uppercase.
- `requireOwnershipIfNeeded` permite owner o permisos indicados.

Riesgo ya visto en rutas: `guards.requirePermission` redirige a `/admin` incluso para rutas `/home`.

## Mobile Auth Y Bootstrap

`mobile.ts`:

- Verifica Firebase ID token Bearer.
- Lee `AccessContext` cacheado.
- Devuelve null si no hay token, uid, acceso o si `estadoAcceso != HABILITADO`.
- `MobileAuthContext.access` es `AccessContext`.

`mobileBootstrap.ts`:

- Devuelve session mobile con:
  - `uid`
  - `email`
  - `nombre`
  - `nombreCorto`
  - `roles`
  - `areas`
  - `permissions` efectivos
  - `estadoAcceso`
  - `isAdmin`
- Usa `getDefaultRoleForRoles`.
- Incluye comunicados pendientes y `roleSelectionRequired`.

Riesgo heredado: `getDefaultRoleForRoles` usa prioridad web; puede escoger un rol sin shell Android si el usuario tiene multiples roles.

## Navegacion RBAC

`homeRoute.ts`:

- Define `ROLE_HOME` y `ROLE_PRIORITY`.
- Fallback si no hay rol: `/home/tecnico`.

`buildHomeNav.ts`:

- Usa mezcla de roles, areas y permisos efectivos.
- `hasPerm` usa `session.permissions`.
- `hasArea` usa `session.access.areas`.
- Incluye reglas especiales para `GESTOR`, `COORDINADOR`, `GERENCIA`, `JEFATURA`, `RRHH`, `SUPERVISOR`, `SEGURIDAD`.

`buildAdminNav.ts`:

- Lista modulos activos desde Firestore.
- Cruza con `ADMIN_NAV_OVERRIDES`.
- Admin ve todo.
- No admin ve modulos por area si `adminOnly` no aplica.
- Tiene fallback operativo para `ACTAS_RENOMBRAR`.

`menu.ts`:

- Mapea keys de modulos a rutas admin.
- Contiene mojibake en labels/comentarios (`MÃ³dulos`, `Ã¡rea`).

## Schemas De Usuario/Roles/Permisos

`domain/usuarios/schema.ts`:

- Separa perfil, acceso, self update y perfil operativo.
- `UserAccessUpdateSchema` modela roles/areas/permissions/estadoAcceso.
- `HomeUserCreateSchema` usa `rolInicial` y no permite acceso avanzado.

`domain/roles/schema.ts`:

- `RoleCreateSchema` incluye `permisos` y `permissions`.
- `permissions` es el estandar usado por `getUserAccessContext`.
- `permisos` parece campo heredado o transicional.

`domain/permissions/permission.schema.ts`:

- Define permiso individual con `id`, `nombre`, `descripcion`, `modulo`, `estado`.

## Riesgos Y Observaciones

- Hay duplicacion conceptual entre `types/*`, `domain/*/schema.ts`, repos y tipos inline en `core/auth`.
- `types/permissions.ts` parece modelar un permiso individual pero incluye `permissions: string[]`; validar si debe eliminarse o renombrarse.
- `RoleCreateSchema` mantiene `permisos` y `permissions`; el runtime usa `permissions`.
- `session.access.permissions` vs `session.permissions` es una fuente probable de bugs.
- `AccessContext` acepta `ACTIVO` como alias historico de `HABILITADO`; documentar si se mantiene o se migra.
- La cache de access context puede demorar cambios de permisos hasta 60 segundos en produccion.
- `invalidateUserAccessContext` no se observo conectado a acciones de admin usuarios en esta lectura.
- Hay mojibake en varios strings de schemas/menus/repos.
- `lib/rbac.ts` solo evalua roles/areas; no debe usarse para permisos finos.
- `getDefaultRoleForRoles` es compartido web/mobile y prioriza roles web.

## Pendientes

- Definir fuente canonica formal para `Permission`, `RoleDoc`, `UsuarioPerfil`, `AccessContext` y `ServerSession`.
- Revisar `types/permissions.ts` y decidir si el campo `permissions: string[]` es error/herencia.
- Resolver duplicacion `permisos` vs `permissions` en `RoleCreateSchema`.
- Documentar en comentarios o tipos la diferencia `session.access.permissions` vs `session.permissions`.
- Conectar `invalidateUserAccessContext` en acciones que cambian `usuarios_access` o roles/permisos.
- Validar si `ACTIVO` historico en `estadoAcceso` debe migrarse a `HABILITADO`.
- Separar prioridad de rol mobile de prioridad web o documentar decision.
- Revisar mojibake en schemas/menus/repos.
- Revisar consumidores de `lib/rbac.ts` antes de marcarlo como vigente o legado.

