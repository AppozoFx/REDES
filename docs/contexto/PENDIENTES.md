# Pendientes de Contexto - REDES

Actualizado: 2026-06-15.

Siguiente unidad recomendada: **Firebase Functions + BigQuery scripts de garantias**.

## Backlog Inicial

| Prioridad | Estado | Tipo | Fuente | Motivo | Accion |
| --- | --- | --- | --- | --- | --- |
| Alta | Revisar | API mobile + Network/API Android | `C:\Proyectos\REDES\apps\web\src\app\api\mobile` + `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network` | Contrato directo entre backend mobile y cliente Android; rutas y DTOs quedaron documentados | Validar inconsistencias detectadas: inicio-jornada supervisor, ruta compartida coordinador/cuadrillas-mapa, errores 404 historicos y mapeo de roles a status |
| Alta | Pendiente | Arquitectura web | `C:\Proyectos\REDES\apps\web` | App Next.js central con rutas protegidas, admin, home y API routes | Documentar estructura App Router, layouts, proteccion y dominios principales |
| Alta | Revisar | Auth/RBAC mobile | `C:\Proyectos\REDES\apps\web\src\core\auth`, `apps\web\src\core\rbac`, rutas `/api/mobile/bootstrap` y `/api/mobile/me` | Define bootstrap mobile, contexto de acceso, roles efectivos y permisos consumidos por Android | Validar defaultRole mobile, 401/403, cache de access context y uso real de permisos |
| Alta | Revisar | Cruce de garantias | `apps\web\src\app\api\ordenes\garantias\cruce`, `apps\web\src\core\garantias\cruceProveedor.ts`, `firebase\functions\src\garantiasCruceSync.ts` | Nuevo flujo de comparacion WIN/REDES con Firestore, Power BI y sync BigQuery | Validar permisos por rol, rutas import/preview, reglas Firestore y tolerancia a fallas parciales en BigQuery |
| Alta | Pendiente | Firebase | `C:\Proyectos\REDES\firebase` | Firestore rules, indexes y functions son frontera de seguridad e integracion | Documentar auth, reglas, colecciones inferidas y funciones |
| Alta | Pendiente | Dominio web | `C:\Proyectos\REDES\apps\web\src\domain` | Contiene repositorios/esquemas por areas de negocio | Documentar domain services por unidad: ordenes, mantenimiento, usuarios, roles, zonas, transferencias |
| Media | Pendiente | Integracion Winbo | `C:\Proyectos\REDES\apps\web\src\lib\winbo` | Integracion externa con tests y sync visibles | Documentar cliente, mappers, parser y scheduler relacionado |
| Media | Pendiente | Cloud Run | `C:\Proyectos\REDES\cloudrun\acta-engine` | Servicio externo para extraccion de actas usado por flujos de actas | Documentar endpoints, contrato, despliegue y dependencia desde web |
| Media | Pendiente | Scripts operativos | `C:\Proyectos\REDES\scripts` | Migraciones, backfills y SQL BigQuery con impacto en datos | Agrupar por importacion, BigQuery, migracion y smoke |
| Media | Pendiente | Rutas web protegidas | `C:\Proyectos\REDES\apps\web\src\app\(protected)` | Muchas pantallas por rol/area | Documentar rutas por modulo sin bajar aun a componentes menores |
| Baja | Pendiente | UI compartida | `C:\Proyectos\REDES\apps\web\src\ui` | Componentes de layout, presencia, notificaciones y navegacion | Documentar despues de rutas y auth |
| Baja | Pendiente | Tipos compartidos | `C:\Proyectos\REDES\apps\web\src\types` | Tipos de auth, permisos y usuarios | Documentar junto con auth/RBAC |

## Nuevos Pendientes Detectados En Fase 0

- API mobile tiene prioridad por ser dependencia directa de REDES-MOBILE.
- Firebase Functions incluye areas visibles: `bootstrapAdmin`, `usersCreate`, `tramoAlertas`, `winboScheduler`, `garantiasCruceSync` y Telegram.
- Scripts recientes de BigQuery/backfill requieren contexto antes de automatizar o programar cambios de datos.
- Cloud Run `acta-engine` ya tiene README operativo, pero falta relacionarlo con rutas web consumidoras.

## Pendientes Detectados En Revision Incremental 2026-06-14

- Documentar rutas `apps\web\src\app\api\ordenes\garantias\cruce\import\route.ts` y `preview\route.ts`.
- Documentar SQL/backfills nuevos de garantias antes de automatizar cambios de datos.
- Revisar reglas Firestore para `garantias_cruce_imports` y `garantias_cruce_periods`.
- Validar si `GERENCIA` y `SUPERVISOR` deben ver cruce de garantias por rol directo sin permiso explicito.
- Revisar estrategia delete+insert de `garantiasCruceSync` ante fallas parciales de BigQuery.
- Registrar como sensible/no indexable el archivo `BBDD_M&D_01-06-2026.xlsx`; no fue abierto.

## Pendientes Detectados En Revision Incremental 2026-06-15

- Validar con negocio que el KPI `redesGarTotal` debe deduplicar por `codigoCliente` y contar GAR `Finalizada` + `Cancelada`, mientras `redesGarOrdenes` conserva ordenes.
- Revisar el cambio de denominador de instalaciones finalizadas: ahora solo cuenta `tipoTraba` en `INSTALACION`, `INSTALACION POSIBLE FRAUDE`, `WINBOX EN COMODATO`, `MESH + WINBOX EN COMODATO` y `PAGO ADELANTADO`.
- Documentar en unidad propia `scripts\bigquery_garantias_cruce_setup.sql`, `scripts\bigquery_garantias_dashboard.sql`, `scripts\bigquery_update_vw_instalacion_garantia.sql` y backfills asociados.
- Comparar `scripts\backfill_garantias_cruce_bq.ts` contra `firebase\functions\backfill_garantias_cruce_bq.ts` antes de recomendar ejecucion operativa.
- Mantener como pendiente sensible/no indexable `BBDD_M&D_01-06-2026.xlsx`; no fue abierto.

## Pendientes Detectados En Deep Dive API Mobile

- Revisar si `RemoteSupervisorRepository.iniciarJornada` debe existir: llama `/api/mobile/inicio-jornada`, pero el backend valida contexto tecnico.
- Decidir si conviene crear/renombrar endpoint para `COORDINADOR_CUADRILLAS_MAPA`, actualmente apuntando a `/api/mobile/tecnico/cuadrillas-mapa`.
- Normalizar errores de rol de helpers mobile para devolver 403 en vez de 500 cuando aplique.
- Actualizar mensajes Android de 404 que indican que endpoints existentes "aun no existen".
- `getUserAccessContextCached`, RBAC y permisos efectivos mobile ya fueron documentados el 2026-06-14; quedan en `Revisar` por las decisiones listadas abajo.

## Pendientes Detectados En Deep Dive Auth/RBAC Mobile

- Definir si `getDefaultRoleForRoles` debe tener variante mobile; la prioridad actual puede escoger roles web sin shell Android.
- Decidir si `getMobileAuthContext` debe distinguir token invalido, usuario sin `usuarios_access` y `estadoAcceso` inhabilitado.
- Normalizar errores de rol de helpers mobile para devolver 403 cuando aplique, no 500 generico.
- Confirmar si `/api/mobile/me` sigue vigente o debe documentarse como legado/fallback.
- Evaluar invalidacion explicita de `accessContext.cached` cuando cambien roles/permisos mobile.
- Revisar si backend debe devolver metadata de version minima en bootstrap para reforzar force update.
- Alinear permisos efectivos con UI mobile si se espera control fino por permisos.

## No Revisado En Profundidad

- Implementacion interna de API routes.
- Reglas Firestore linea por linea.
- Funciones Firebase exportadas en `index.ts`.
- Componentes UI y hooks.
- SQL y scripts de migracion.
- Archivos temporales, binarios, `node_modules`, `.next`, outputs y secretos locales.
