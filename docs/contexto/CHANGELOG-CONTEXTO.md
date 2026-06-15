# Changelog de Contexto - REDES

## 2026-06-15 - Revision incremental diaria: garantias y BigQuery

- Detectados cambios relevantes en `apps/web/src/app/api/ordenes/garantias/cruce/route.ts`, `GarantiasCruceClient.tsx`, `firebase/functions/src/index.ts`, `firebase/functions/src/garantiasCruceSync.ts` y scripts/backfills BigQuery de garantias.
- Actualizado `web/garantias-cruce.md`: GAR REDES ahora considera `Finalizada` + `Cancelada`, tasa REDES deduplicada por cliente, KPI `proveedorRedesPendiente`, filtro `tipoSeguiClien=GAR` y denominador por tipos explicitos de instalacion.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; unidad sigue en `Revisar`.
- Pendientes nuevos: validar definicion de KPI con negocio, documentar SQL/backfills BigQuery como unidad propia y comparar variantes de backfill.
- No se modifico codigo fuente, configs, Firebase, SQL, scripts, binarios ni credenciales.

## 2026-06-14 - Revision incremental diaria: cruce de garantias

- Detectados cambios relevantes en `apps/web/src/app/api/ordenes/garantias/cruce`, `apps/web/src/core/garantias/cruceProveedor.ts`, `firebase/functions/src/garantiasCruceSync.ts` y scripts BigQuery/backfill de garantias.
- Creado `web/garantias-cruce.md` con API de cruce, parser/persistencia de proveedor, colecciones Firestore inferidas, sync BigQuery y diagrama Mermaid.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; unidad marcada como `Revisar`.
- Pendientes nuevos: rutas `import`/`preview`, SQL/backfills BigQuery, reglas Firestore de nuevas colecciones y validacion de permisos por rol.
- No se modifico codigo fuente, configs, Firebase, SQL, scripts ni credenciales.

## 2026-06-14 - Cierre corto recuperacion auth/RBAC mobile

- Validada con `Get-Content -LiteralPath` la ruta `apps/web/src/app/api/mobile/comunicados/[id]/seen/route.ts`, pendiente por error tecnico de PowerShell con corchetes.
- Actualizado `web/auth-rbac-mobile.md` con la conducta exacta de `POST /api/mobile/comunicados/{id}/seen`: auth mobile, validacion de id y persistencia via `markMobileComunicadoSeen`.
- La unidad `Sesion/bootstrap/auth REDES-MOBILE + RBAC/accessContext REDES` se mantiene en `Revisar` por decisiones humanas pendientes sobre roles mobile, 401/403, cache, permisos y force update.
- No se modifico codigo fuente, configs, Firebase ni credenciales.

## 2026-06-14 - Deep dive auth/RBAC mobile + sesion REDES-MOBILE

- Creado `web/auth-rbac-mobile.md` con validacion Firebase Admin, `usuarios_access`, permisos efectivos, cache de access context, bootstrap mobile, `/api/mobile/me`, comunicados y cruce con Android.
- Actualizado `architecture/diagrams.md` con secuencia Auth/RBAC mobile y decision de acceso.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; unidad marcada como `Revisar`.
- Hallazgos principales: `/api/mobile/me` parece legado/fallback, `getMobileAuthContext` colapsa inhabilitado/no autorizado en 401, `defaultRole` reutiliza prioridad web, errores de rol pueden caer como 500 y permisos efectivos no se usan para gating Android en la unidad leida.
- No se modifico codigo fuente, configs, Firebase ni credenciales.

## 2026-06-13 - Cierre corto API mobile + Network/API

- Validada la documentacion creada para `web/api-routes.md` contra los consumidores Android ya registrados.
- Confirmado que el hueco tecnico correspondia a una ruta Android mal asumida, no a un endpoint backend faltante.
- La unidad se mantiene en `Revisar` por inconsistencias de contrato: inicio-jornada supervisor, ruta compartida de coordinador, errores 404 historicos y mapeo de roles.
- No se modifico codigo fuente, configs, Firebase ni credenciales.

## 2026-06-13 - Deep dive API mobile REDES + Network/API REDES-MOBILE

- Creado `web/api-routes.md` con contrato endpoint por endpoint para `apps/web/src/app/api/mobile`.
- Actualizado `architecture/diagrams.md` con flujo Android -> API mobile -> auth helpers -> Firebase y token flow.
- Actualizados `INDEX.md` y `PENDIENTES.md`: unidad marcada como `Revisar`.
- Registradas inconsistencias: `RemoteSupervisorRepository.iniciarJornada` contra endpoint tecnico, ruta compartida `tecnico/cuadrillas-mapa` para coordinador, errores 404 historicos y mapeo de errores de rol.
- No se modifico codigo fuente ni configuracion.

## 2026-06-13 - Fase 0 validacion y cierre

- Validada la existencia de documentos base de Fase 0: `README.md`, `INDEX.md`, `PENDIENTES.md`, `CHANGELOG-CONTEXTO.md`, `architecture/overview.md`, `architecture/diagrams.md` e `indexes/source-index.json`.
- Revisados diagramas Mermaid iniciales como mapas de alto nivel, sin deep dive de funciones.
- Actualizados `INDEX.md` y `PENDIENTES.md` para dejar como primera unidad conjunta: `API mobile REDES + Network/API REDES-MOBILE`.
- Confirmada existencia superficial de `apps/web/src/app/api/mobile` y del paquete Android `network`.

Notas:

- No se hizo Fase 1 ni Fase 2.
- No se modifico codigo fuente.
- No se usaron globs de exclusion riesgosos en PowerShell.

## 2026-06-13 - Fase 0 mapa simple inicial

- Actualizado `README.md` con alcance de Fase 0 y mapa rapido.
- Creado `INDEX.md` con unidades documentales detectadas.
- Actualizado `PENDIENTES.md` con backlog inicial.
- Creado `architecture/overview.md`.
- Creado `architecture/diagrams.md` con Mermaid de arquitectura general y relacion con REDES-MOBILE.
- Creado `indexes/source-index.json` como indice superficial.

Notas:

- No se hizo deep dive archivo por archivo.
- No se modifico codigo fuente.
- No se copiaron secretos ni valores sensibles.
