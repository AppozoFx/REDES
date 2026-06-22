# Indice de Contexto - REDES

Actualizado: 2026-06-21.

Estado actual: unidad **Dominio critico: mantenimientoLiquidaciones** documentada. Se mantienen pendientes por permisos granulares, borrado fisico, concurrencia de visitas, correccion con cambio de cuadrilla, limite de export e indices.

## Estado General

| Area | Estado | Fuente | Documento | Prioridad | Notas |
| --- | --- | --- | --- | --- | --- |
| Arquitectura inicial | Documentado | `C:\Proyectos\REDES` | `architecture/overview.md` | Alta | Fase 0 superficial |
| Diagramas iniciales | Documentado | `C:\Proyectos\REDES` | `architecture/diagrams.md` | Alta | Mermaid de alto nivel |
| Web App Router | Revisar | `apps\web\src\app\(protected)` | `web/routes.md` | Alta | Rutas protegidas documentadas; revisar paginas sin guard propio y divergencia nav/guards |
| API mobile REDES + Network/API REDES-MOBILE | Revisar | `apps\web\src\app\api\mobile` + `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network` | `web/api-routes.md` + `C:\Proyectos\REDES-MOBILE\docs\contexto\android\network.md` | Alta | Deep dive documentado + cambios predespacho 2026-06-18 aplicados (coleccion Firestore, respuesta con precon, backend reescrito) |
| Cruce de garantias WIN/REDES | Revisar | `apps\web\src\app\api\ordenes\garantias\cruce`, `apps\web\src\core\garantias\cruceProveedor.ts`, `firebase\functions\src\garantiasCruceSync.ts` | `web/garantias-cruce.md` + `web/garantias-import-preview.md` | Alta | Import/preview documentados; faltan decisiones de permisos, carrera import/sync, reglas Firestore y validacion BigQuery |
| Domain services | Revisar | `apps\web\src\domain` | `web/domain-services.md` | Alta | Mapa de 19 dominios documentado; profundizar modulos criticos antes de cambios |
| Mantenimiento liquidaciones | Revisar | `apps\web\src\domain\mantenimientoLiquidaciones`, `apps\web\src\app\api\mantenimiento\liquidaciones`, pantallas `/home/mantenimiento/liquidaciones` | `web/mantenimiento-liquidaciones.md` | Alta | Deep dive documentado; revisar permisos granulares, borrado fisico, visitas concurrentes, correccion de stock y export limitado |
| Auth/RBAC mobile | Revisar | `apps\web\src\core\auth`, `apps\web\src\core\rbac`, rutas `/api/mobile/bootstrap` y `/api/mobile/me` | `web/auth-rbac-mobile.md` | Alta | Deep dive completado; revisar defaultRole mobile, permisos no usados por Android y 401/403 |
| Firebase rules/indexes | Revisar | `firebase\firestore.rules`, `firebase\firestore.indexes.json` | `firebase/auth-firestore-rules.md` | Alta | Rules/indexes documentados; `app_config` y lectura de `alertas_app` ya tienen regla explicita en fuente; queda revisar `cuadrillas/{id}/stock`, `notificaciones_tecnico` e indices |
| Firebase Functions | Revisar | `firebase\functions\src` | `firebase/functions.md` + `firebase/functions-restantes.md` | Alta | `garantiasCruceSync`, Telegram, tramos, `usersCreate` y `bootstrapAdmin` documentados; revisar decisiones pendientes |
| Cloud Run acta-engine | Revisar | `cloudrun\acta-engine` | `cloudrun/acta-engine.md` | Media | Servicio Flask/PyMuPDF/pyzbar documentado; validar token, modo default active, limites y timeout |
| Scripts operativos | Revisar | `scripts` | `scripts/maintenance-scripts.md` | Media | SQL/backfills de garantias documentados; requiere decisiones antes de ejecutar |
| Integracion Winbo | Revisar | `apps\web\src\lib\winbo`, rutas `/api/ordenes/import/winbo`, `firebase\functions\src\winboScheduler.ts` | `web/winbo-integracion.md` | Media | Cliente export XLSX, parser/mapper, sync manual/cron, lock y scheduler documentados |
| UI compartida, notificaciones y presencia | Revisar | `apps\web\src\ui`, `apps\web\src\domain\notificaciones`, `apps\web\src\domain\alertas-app`, rutas de presencia | `web/ui-notificaciones-presencia.md` | Baja | Topbars, campanas, toasts, presencia web/mobile y alertas app documentados |
| Tipos compartidos y contratos usuario/permisos | Revisar | `apps\web\src\types`, `apps\web\src\core\auth`, `apps\web\src\core\rbac`, dominios usuarios/roles/permissions | `web/types-auth-permisos.md` | Baja | `UserAccess`, `AccessContext`, `ServerSession`, schemas Zod, guards y navegacion RBAC documentados |
| Indice de fuente | Documentado | estructura superficial | `indexes/source-index.json` | Media | No es cobertura completa |

## Orden Propuesto De Documentacion

1. Dominio critico: transferencias/instalaciones.
2. Dominio critico: cuadrillas.

## Evidencia De Manifests

- `package.json` raiz declara scripts de dev web, emuladores Firebase, build functions, smoke API y migraciones.
- `pnpm-workspace.yaml` incluye `apps/*`, `packages/*`, `firebase/*`.
- `firebase.json` raiz configura hosting con source `apps/web` y backend frameworks en `us-central1`.
- `apps/web/package.json` declara Next 15, React 19, Firebase, Firebase Admin, OpenAI, Leaflet, Recharts, XLSX y Zod.
- `firebase/functions/package.json` declara runtime Node 22, Firebase Functions 7, Admin 13, BigQuery y Zod.

## Cobertura

Cobertura actual: mapa inicial. No representa documentacion completa ni validacion funcional.
