# Indice de Contexto - REDES

Actualizado: 2026-06-15.

Estado actual: revision incremental diaria ejecutada. Se actualizo el contrato del **Cruce de garantias WIN/REDES** por cambios de KPI/matching y se marcaron pendientes de BigQuery/backfill. Siguiente unidad recomendada: **Firebase Functions + BigQuery scripts de garantias**.

## Estado General

| Area | Estado | Fuente | Documento | Prioridad | Notas |
| --- | --- | --- | --- | --- | --- |
| Arquitectura inicial | Documentado | `C:\Proyectos\REDES` | `architecture/overview.md` | Alta | Fase 0 superficial |
| Diagramas iniciales | Documentado | `C:\Proyectos\REDES` | `architecture/diagrams.md` | Alta | Mermaid de alto nivel |
| Web App Router | Pendiente | `apps\web\src\app` | `web/routes.md` | Alta | Detectadas rutas admin, home, temporales y API |
| API mobile REDES + Network/API REDES-MOBILE | Revisar | `apps\web\src\app\api\mobile` + `C:\Proyectos\REDES-MOBILE\app\src\main\java\com\redes\app\network` | `web/api-routes.md` + `C:\Proyectos\REDES-MOBILE\docs\contexto\android\network.md` | Alta | Deep dive documentado; requiere validar inconsistencias puntuales del contrato |
| Cruce de garantias WIN/REDES | Revisar | `apps\web\src\app\api\ordenes\garantias\cruce`, `apps\web\src\core\garantias\cruceProveedor.ts`, `firebase\functions\src\garantiasCruceSync.ts` | `web/garantias-cruce.md` | Alta | Actualizado 2026-06-15: GAR incluye finalizadas/canceladas, tasa por clientes unicos, denominador por tipos de instalacion; faltan import/preview, SQL/backfills y validacion BigQuery |
| Domain services | Pendiente | `apps\web\src\domain` | `web/domain-services.md` | Alta | Repos/esquemas por dominio |
| Auth/RBAC mobile | Revisar | `apps\web\src\core\auth`, `apps\web\src\core\rbac`, rutas `/api/mobile/bootstrap` y `/api/mobile/me` | `web/auth-rbac-mobile.md` | Alta | Deep dive completado; revisar defaultRole mobile, permisos no usados por Android y 401/403 |
| Firebase rules/indexes | Pendiente | `firebase\firestore.rules`, `firebase\firestore.indexes.json` | `firebase/auth-firestore-rules.md` | Alta | No leer valores sensibles |
| Firebase Functions | Actualizar | `firebase\functions\src` | `firebase/functions.md` | Alta | Nueva `garantiasCruceSync` exportada; requiere deep dive de functions |
| Cloud Run acta-engine | Pendiente | `cloudrun\acta-engine` | `cloudrun/acta-engine.md` | Media | README existente revisado superficialmente |
| Scripts operativos | Actualizar | `scripts` | `scripts/maintenance-scripts.md` | Media | Nuevos SQL/backfills BigQuery de garantias detectados |
| Indice de fuente | Documentado | estructura superficial | `indexes/source-index.json` | Media | No es cobertura completa |

## Orden Propuesto De Documentacion

1. Firebase Functions + BigQuery scripts de garantias.
2. Rutas `import` y `preview` del cruce de garantias.
3. Firebase rules, colecciones e indexes.
4. Rutas web protegidas por dominio de negocio.
5. Domain services y repositorios web.
6. Cloud Run `acta-engine`.
7. UI compartida, notificaciones y presencia.

## Evidencia De Manifests

- `package.json` raiz declara scripts de dev web, emuladores Firebase, build functions, smoke API y migraciones.
- `pnpm-workspace.yaml` incluye `apps/*`, `packages/*`, `firebase/*`.
- `firebase.json` raiz configura hosting con source `apps/web` y backend frameworks en `us-central1`.
- `apps/web/package.json` declara Next 15, React 19, Firebase, Firebase Admin, OpenAI, Leaflet, Recharts, XLSX y Zod.
- `firebase/functions/package.json` declara runtime Node 22, Firebase Functions 7, Admin 13, BigQuery y Zod.

## Cobertura

Cobertura actual: mapa inicial. No representa documentacion completa ni validacion funcional.
