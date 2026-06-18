# Domain Services y Repositorios Web - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Deep dive de mapa y responsabilidades en `apps\web\src\domain`. No es auditoria completa linea por linea de cada operacion de inventario o liquidacion.

## Alcance

Fuentes leidas:

- Inventario completo de archivos bajo `apps\web\src\domain`.
- Busqueda de exports, colecciones Firestore y consumidores `@/domain/*`.
- Lectura focalizada de repos/services principales: usuarios, ordenes, mantenimiento liquidaciones, notificaciones, alertas, reglas de supervisores y helpers compartidos.

No se ejecuto la app, tests, emuladores ni queries contra datos reales.

## Resumen

`apps\web\src\domain` contiene 19 dominios y 42 archivos.

Patrones observados:

- `repo.ts`: acceso a Firestore/Admin SDK, normalizacion y operaciones CRUD.
- `service.ts`: orquestacion de Auth, repos, notificaciones o reglas de negocio.
- `schemas.ts` / `schema.ts`: validacion Zod y tipos de entrada.
- Helpers puros: geometria de zonas, tramos de ordenes, conversiones de materiales/equipos.
- Excepciones cliente: `alertas-app/repo.ts` y `notificaciones/repo.ts` usan Firebase Web SDK en cliente.

## Dominios

| Dominio | Archivos | Responsabilidad |
| --- | --- | --- |
| `alertas-app` | `repo.ts` | Listeners cliente para alertas app por dia o pendientes. |
| `comunicados` | `repo.ts`, `schema.ts`, `service.ts` | CRUD de comunicados, cumpleaños, gating de comunicados pendientes y marcado de vistos. |
| `cuadrillas` | `repo.ts`, `schemas.ts` | CRUD de cuadrillas instalaciones/mantenimiento, numeracion, validacion de tecnicos y zonas. |
| `equipos` | `repo.ts`, `schemas.ts`, `service.ts` | Import/normalizacion de equipos, SN existentes, ubicacion/estado y fechas Lima. |
| `integrations/telegram/mantenimiento` | `parser.ts`, `repo.ts` | Parseo de mensajes Telegram de mantenimiento, ingresos, mappings y resultados de ticket. |
| `mantenimientoCausasRaiz` | `repo.ts` | Catalogo de causas raiz y validacion de uso antes de borrar. |
| `mantenimientoLiquidaciones` | `repo.ts`, `schemas.ts` | Liquidaciones de mantenimiento, tickets, visitas, stock de cuadrilla, movimientos e historial. |
| `materiales` | `repo.ts`, `schemas.ts` | Catalogo de materiales, normalizacion de nombres/precios, unidades y conversiones metros/cm. |
| `modulos` | `repo.ts`, `schema.ts`, `service.ts` | Catalogo de modulos para navegacion/admin. |
| `notificaciones` | `repo.ts`, `service.ts` | Notificaciones globales, realtime cliente y read flags. |
| `ordenes` | `repo.ts`, `schemas.ts`, `tramo.ts`, `notificaciones-tecnico.ts` | Upsert de ordenes Winbo, enriquecimiento de cuadrilla, tramos y notificaciones a tecnico. |
| `permissions` | `permission.schema.ts`, `permissions.repo.ts` | Catalogo de permisos RBAC. |
| `roles` | `repo.ts`, `schema.ts` | Roles RBAC y permisos por rol. |
| `supervisores` | `access.ts`, `repo.ts`, `schemas.ts` | Configuracion de supervisores, acceso y asignacion actual por dia/base. |
| `temporalPublic` | `repo.ts` | Pagina publica temporal desde `site_config/public_temporal_page`. |
| `transferencias/instalaciones` | `moveEquipo.ts`, `schemas.ts`, `service.ts` | Transferencias de equipos/materiales, bobinas, precons y movimiento entre cuadrillas. |
| `usuarios` | `repo.ts`, `schema.ts`, `service.ts` | Perfil, access, Auth user creation y actualizaciones operativas/self. |
| `ventas` | `schemas.ts`, `service.ts` | Inputs de ventas, cuotas/pagos/anulacion y secuencias de venta. |
| `zonas` | `geometry.ts`, `repo.ts`, `schemas.ts` | CRUD de zonas, counters y normalizacion GeoJSON/poligonos. |

## Colecciones Firestore Principales

Colecciones propias o muy usadas por dominio:

- `usuarios`, `usuarios_access`
- `roles`, `permissions`, `modulos`
- `notificaciones`, `notificaciones_reads`
- `comunicados`, `comunicados_reads`
- `ordenes`, `notificaciones_tecnico/{cuadrillaId}/items`
- `cuadrillas`, `cuadrillas_numbers`, `cuadrillas_counters`
- `zonas`, `zonas_counters`
- `equipos`
- `materiales`
- `mantenimiento_liquidaciones`, `mantenimiento_causas_raiz`
- `movimientos_inventario`
- `supervisores`, `asignacion_supervisores_base`, `asignacion_supervisores_dia`, `asignacion_supervisores_zona_dia`
- `telegram_updates_mantenimiento`, `telegram_mantenimiento_ingresos`, `telegram_mantenimiento_thread_mappings`
- `site_config`
- `sequences`

## Consumidores

Consumidores principales detectados:

- `core/auth/accessContext.ts` consume `roles`.
- `core/rbac/buildAdminNav.ts` consume `modulos`.
- `core/auth/mobileBootstrap.ts` consume `comunicados`.
- `core/auth/mobileSupervisor.ts` consume `supervisores`.
- `lib/winbo/sync.ts` consume `ordenes` y `notificaciones`.
- Admin pages/actions consumen `usuarios`, `roles`, `permissions`, `modulos`, `comunicados`, `temporalPublic`.
- Home pages/actions consumen `cuadrillas`, `zonas`, `materiales`, `usuarios`, `supervisores`, `ventas`, `ordenes`, `transferencias`.
- API routes consumen mantenimiento, instalaciones, ordenes, Telegram, supervisores y notificaciones.

## Fronteras Cliente vs Servidor

Mayormente servidor/Admin SDK:

- CRUD de usuarios, roles, permisos, modulos.
- Import/upsert de ordenes.
- Materiales/equipos/inventario.
- Mantenimiento liquidaciones.
- Supervisores.
- Telegram.
- Transferencias.

Cliente directo:

- `notificaciones/repo.ts`: escucha `notificaciones` y marca `notificaciones_reads`.
- `alertas-app/repo.ts`: escucha `alertas_app`.

Esto conecta con la unidad de Firestore rules: `notificaciones` esta permitido por reglas, pero `alertas_app` no tiene regla explicita.

## Dominios Con Reglas De Negocio Relevantes

### Ordenes

`ordenes/repo.ts`:

- `upsertOrden` normaliza datos Winbo, fechas Lima, georeferencia, tipo de seguimiento (`GAR`/`AT`) y opcionales desde `idenServi`.
- Enriquece cuadrilla desde `cuadrillas` con cache en memoria.
- Detecta cambios de negocio comparando campos relevantes.
- Notifica a tecnico cuando se crea orden, cambia cuadrilla o cambia estado.

Riesgos:

- Cache de cuadrilla es local al proceso; puede quedar stale hasta reinicio de instancia.
- Comparacion de negocio usa `JSON.stringify` de subset; cambios fuera del subset no disparan update.

### Mantenimiento Liquidaciones

`mantenimientoLiquidaciones/repo.ts`:

- Valida tickets, visitas, cuadrilla de mantenimiento, materiales consumidos y coordenadas.
- Normaliza `BORRADOR` a `ABIERTO`.
- Opera stock de `cuadrillas/{id}/stock`, materiales y `movimientos_inventario`.

Riesgos:

- Es un modulo de alto impacto en inventario; requiere pruebas dedicadas antes de cambios.
- Mezcla validacion, lectura, escritura y movimientos en un repositorio grande.

### Cuadrillas / Zonas / Supervisores

- Cuadrillas valida zona habilitada, tecnicos no asignados y area.
- Zonas maneja geometry y counters.
- Supervisores cruza `usuarios_access`, perfiles, config y asignaciones base/dia/zona.

Riesgos:

- Varias reglas de asignacion viven en repos y tambien en rutas/API; revisar duplicacion antes de modificar.

### Usuarios / RBAC

- `usuarios/service.ts` puede crear Auth user y docs `usuarios` + `usuarios_access`.
- `usuarios/repo.ts` separa updates self/operativos.
- `roles` y `permissions` alimentan access context.

Riesgos:

- Creacion desde Home bloquea rol inicial `ADMIN`, pero crea access habilitado sin permisos directos.
- Cambios de roles/permisos pueden quedar cacheados por `accessContext.cached` segun unidad auth/RBAC.

### Notificaciones / Comunicados

- Notificaciones globales crean docs en `notificaciones`; cliente marca read flags.
- Comunicados implementa gating de pendientes, banners y birthdays.

Riesgos:

- `comunicados_reads` no aparece en reglas Firestore porque se usa por Admin SDK/API; cliente directo no deberia tocarlo.

## Observaciones De Arquitectura

- El directorio `domain` no es puramente dominio: combina repos Firestore, servicios, validacion Zod, helpers y listeners cliente.
- Algunos modulos estan bastante cohesionados (`zonas`, `roles`, `permissions`, `materiales`).
- Algunos modulos son orquestadores grandes con alto acoplamiento a Firestore/inventario (`mantenimientoLiquidaciones`, `transferencias/instalaciones`, `cuadrillas`).
- `equipos/service.ts` solo exporta vacio (`export {}`), parece placeholder o remanente.
- Hay logica de negocio compartida en `domain`, pero tambien mucha logica sigue en server actions/API routes; el dominio no es una unica capa canonica.

## Pendientes

- Profundizar por dominio critico antes de cambios: `mantenimientoLiquidaciones`, `transferencias/instalaciones`, `cuadrillas`, `ordenes`.
- Revisar si `equipos/service.ts` debe eliminarse o completarse.
- Decidir si listeners cliente (`alertas-app`) pertenecen a `domain` o a una capa `client`.
- Extraer matriz coleccion -> dominio -> rules/indexes para alinear con Firebase rules.
- Validar duplicacion de reglas entre repos, server actions y API routes.
