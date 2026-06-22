# Changelog de Contexto - REDES

## 2026-06-22 - Feature: toast feedback en /admin/usuarios/[uid] + mejora visual

- **Problema**: los formularios de edición de usuario (`/admin/usuarios/{uid}`) no daban feedback al guardar — `SubmitActionButton` solo mostraba un ciclo visual idle→spinner→✓ pero nunca lanzaba toast.
- **Causa raíz**: las acciones eran inline `"use server"` dentro de `<form action={...}>` y no devolvían su resultado al cliente.
- **Solución**: patrón `useActionState` + bound server actions.
  - `actions.ts`: agregados 4 wrappers con firma `(uid, _prev, formData)` para compatibilidad con `useActionState`: `updateUsuarioPerfilForm`, `updateUsuarioAccessForm`, `disableUsuarioForm`, `enableUsuarioForm`. Llaman a las acciones originales sin cambiar su contrato.
  - Nuevo `[uid]/FormWrapper.tsx` (client component): recibe una `action` bound, llama `useActionState(action, null)`, dispara `toast.success(successMsg)` o `toast.error(msg)` en `useEffect([state])`.
  - `[uid]/page.tsx` actualizado: crea los 4 bound actions con `.bind(null, uid)`, reemplaza todos los `<form>` con `<FormWrapper>`, los campos del formulario quedan como children (patrón server-component-as-children).
- **Visual**: botón "Guardar acceso" unificado al estilo primario REDES (`bg-[#30518c]`) para consistencia con "Guardar perfil".
- **Toasts producidos**: éxito verde para perfil/acceso/habilitar, error rojo con mensaje del servidor si la acción falla (permisos, ADMIN, usuario no encontrado, etc.).
- No se modificaron Firestore rules, API routes, Cloud Functions, package files, lockfiles, credenciales ni binarios.

## 2026-06-21 - Revision incremental diaria: Firestore rules para force update y alertas

- Revisados `git status` y `git diff --name-only` de REDES y REDES-MOBILE.
- REDES muestra cambio funcional en `firebase/firestore.rules`: nueva lectura publica `get` para `app_config/{docId}` y lectura autenticada `get/list` para `alertas_app/{id}`, con escrituras cliente denegadas.
- `docs/contexto/firebase/auth-firestore-rules.md` ya reflejaba la regla nueva; se actualizaron `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json` para cerrar los pendientes de regla faltante para `app_config` y lectura de `alertas_app`.
- Quedan pendientes: validar deploy/emulador de reglas, revisar alcance de lectura autenticada general en `alertas_app`, definir reglas para `notificaciones_tecnico` y decidir `cuadrillas/{id}/stock`.
- No se modifico codigo fuente, configs, Firebase rules, package files, lockfiles, SQL, scripts, credenciales ni binarios.

## 2026-06-18 - Feature: coordinador cuadrillas con equipos y detalle de orden

- **Backend `cuadrillas/route.ts`**: agregados `cantMesh`, `cantFono`, `cantBox` a cada item de `ordenes.items` leyendo `cantMESHwin`/`cantFONOwin`/`cantBOXwin` de la coleccion `ordenes`.
- **Nuevo endpoint** `GET /api/mobile/coordinador/ordenes/[id]`: devuelve detalle de orden (cliente, documento, telefono, tipo, fecha, region, cuadrilla, lat/lng, cantMesh/cantFono/cantBox); valida que la orden pertenezca a una cuadrilla del coordinador, devuelve 403 si no.
- Actualizado `web/api-routes.md` con la nueva fila y la actualizacion del row de cuadrillas.
- No se modifico Gradle, configs, Firebase rules, package files, lockfiles, credenciales ni binarios.

## 2026-06-18 - Fix: updatedByName mostraba UID en lugar de nombre

- **Causa**: `PredespachoClient.tsx` no enviaba `userName` en el body del `POST /api/instalaciones/predespacho/save`. El servidor usaba `uid` como fallback, almacenando el UID de Firebase en `updatedByName`.
- **Fix dashboard** (`api/instalaciones/predespacho/dashboard/route.ts`): agrega `currentUserName` a la respuesta usando el indice `usersIdx` que ya existia (uid → nombre corto: primer nombre + primer apellido).
- **Fix cliente** (`PredespachoClient.tsx`): nuevo estado `currentUserName` cargado desde la respuesta del dashboard; incluido como `userName` en el body del guardado.
- `save/route.ts`: sin cambios — ya tenia `body?.userName || uid`.
- Registros guardados antes de esta fecha conservan el UID; los nuevos guardados muestran el nombre correctamente.
- Beneficio mobile: `GET /api/mobile/coordinador/predespacho` devuelve `updatedByName` directo de Firestore, por lo que REDES-MOBILE tambien mostrara el nombre correcto en nuevos guardados sin cambios de codigo Android.

## 2026-06-18 - Implementacion predespacho coordinador (mobile backend + web UI)

- **`api/mobile/coordinador/predespacho/route.ts`** reescrito: ahora lee `instalaciones_predespacho` (coleccion activa) en lugar de `instalaciones_predespacho_rows` (legacy). Batches de 30 por `cuadrillaId in [...]`, filtro en memoria `startYmd <= ymd <= endYmd`, agregacion sumando `final.ONT/MESH/FONO/BOX`, extraccion de `precon/bobinaResi/rolloCondo` solo de docs `ALL` o `SHARED`. La respuesta incluye `precon: { PRECON_50, PRECON_100, PRECON_150, PRECON_200 }` por fila.
- **`PredespachoClient.tsx`** (web): para `scope === "coordinador"`: auto-confirma modo (sin selector), muestra solo cuadrillas con `savedInfo[id]?.updatedAt`, oculta filtros Estado/Modelo/Grupo/Lote, oculta chips "Ver omitidas"/"Cambiar modo"/estado IA, oculta Panel de recursos completo.
- Actualizado `web/api-routes.md`: descripcion de respuesta del endpoint predespacho + coleccion Firestore activa.
- No se modifico Gradle, configs, Firebase rules, package files, lockfiles, credenciales ni binarios.

## 2026-06-18 - Cruce tecnico mobile alertas/cierre de ruta

- Revisado el cruce backend de la unidad REDES-MOBILE `Tecnico alertas/notificaciones y cierre de ruta`.
- Fuentes leidas: `apps/web/src/app/api/mobile/alertas-app/route.ts`, `apps/web/src/app/api/mobile/inicio-jornada/route.ts`, `apps/web/src/app/api/mobile/tracking/route.ts`, rutas tecnico mobile, `apps/web/src/app/api/alertas-app/[id]/responder/route.ts`, `domain/alertas-app/repo.ts` y `domain/ordenes/notificaciones-tecnico.ts`.
- Actualizado `web/api-routes.md` con el contrato: `/api/mobile/alertas-app` solo crea/reutiliza alerta; `POST /api/alertas-app/{id}/responder` es quien escribe `RUTA_CERRADA` y crea `notificaciones_tecnico`.
- Actualizados `PENDIENTES.md` e `indexes/source-index.json` con riesgos de Firestore rules, rechazo de alertas y sincronizacion mobile.
- No se modifico codigo fuente, configs, Firebase rules, SQL, scripts ni credenciales.

## 2026-06-18 - Cruce force update REDES-MOBILE

- Revisado el cruce backend para force update desde REDES-MOBILE.
- Fuentes leidas: `apps/web/src/app/api/mobile/bootstrap/route.ts` y `apps/web/src/core/auth/mobileBootstrap.ts`; busqueda en REDES por `versionMinima`, `versionNominalMinima`, `app_config`, `force update`, `minVersion`, `versionCode` y `bootstrap`.
- Hallazgo: no se observo refuerzo backend de version minima en `/api/mobile/bootstrap`; el gate actual depende de Firestore directo desde Android (`app_config/android`).
- Actualizado `PENDIENTES.md` para mantener la decision de refuerzo backend como pendiente de contrato mobile.
- No se modifico codigo fuente, configs, Firebase, SQL, scripts ni credenciales.

## 2026-06-16 - Deep dive mantenimiento liquidaciones

- Creado `web/mantenimiento-liquidaciones.md` con dominio `mantenimientoLiquidaciones`, schemas, repo, APIs CRUD/liquidar/corregir/export, pantallas, causas raiz, stock de cuadrillas e integracion Telegram create-ticket.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: dominio critico `transferencias/instalaciones`.
- Hallazgos: las liquidaciones consumen/devuelven stock de `cuadrillas/{id}/stock`, crean movimientos `LIQUIDACION_MANTENIMIENTO`, `CORRECCION_LIQUIDACION_MANTENIMIENTO` y `ELIMINACION_LIQUIDACION_MANTENIMIENTO`, y el export XLSX parte de las ultimas 500 liquidaciones.
- Riesgos destacados: operaciones criticas protegidas solo por area `MANTENIMIENTO`, borrado fisico de liquidaciones/causas raiz, `ticketVisita` fuera de transaccion, correccion con cambio de cuadrilla y falta de indices documentados para volumen.
- No se ejecuto la app, tests, emuladores, exports reales, deploys ni escrituras contra Firestore.

## 2026-06-16 - Deep dive Firebase Functions restantes

- Creado `firebase/functions-restantes.md` con `bootstrapAdmin`, `usersCreate`, alertas de tramo, Telegram webhook, parser, fallback IA, retries, recordatorios y cleanup.
- Actualizado `firebase/functions.md` para enlazar la unidad y cerrar el pendiente de functions no documentadas.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: dominio critico `mantenimientoLiquidaciones`.
- Hallazgos: Telegram deduplica updates, guarda preliquidaciones por `pedido_ymd`, reintenta pedidos no encontrados cada 30 minutos y envia recordatorios a las 10/12/14/16/18/20 Lima.
- Riesgos destacados: `TELEGRAM_ALLOWED_USER_IDS` no bloquea plantillas normales, retries por pedido pueden colisionar entre chats/dias, mensajes Telegram usan Markdown, auth helpers estan duplicados y `usersCreate` puede divergir del schema web.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecutaron deploys, emuladores, cron jobs, llamadas Telegram/OpenAI ni escrituras contra Firestore.

## 2026-06-15 - Deep dive tipos compartidos y contratos usuario/permisos

- Creado `web/types-auth-permisos.md` con mapa de `src/types`, schemas Zod de usuarios/roles/permisos, `AccessContext`, `ServerSession`, guards web/API, bootstrap mobile y navegacion RBAC.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: resto de Firebase Functions no documentadas.
- Hallazgos: `AccessContext` es el contrato canonico de permisos efectivos; `ServerSession.access.permissions` son permisos directos y `ServerSession.permissions` son permisos efectivos.
- Riesgos destacados: duplicacion `permisos`/`permissions`, `types/permissions.ts` con campo sospechoso `permissions`, cache de access context sin invalidacion observada en acciones admin, prioridad de rol web compartida con mobile y mojibake.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecuto la app, tests, emuladores ni escrituras contra Firestore.

## 2026-06-15 - Deep dive Integracion Winbo

- Creado `web/winbo-integracion.md` con cliente HTTP WinBo, descarga XLSX, parser, mapper, sync manual/cron, lock, audit run, scheduler Firebase y upsert de ordenes.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: Tipos compartidos y contratos de usuario/permisos.
- Hallazgos: flujo manual protegido por `ORDENES_IMPORT`, cron protegido por `WINBO_CRON_TOKEN`, scheduler cada 5 minutos entre 07:30-22:00 Lima y lock `system_locks/winbo_ordenes_sync`.
- Riesgos destacados: endpoints externos/cookies fragiles, reentrada posible del mismo owner de lock, TTL 20 min, rango manual sin limite maximo, retries default 3, `downloadUrl` en respuesta/audit y mojibake en strings.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecutaron llamadas reales a WinBo, cron, Cloud Scheduler, Firebase deploys, emuladores ni escrituras contra Firestore.

## 2026-06-15 - Deep dive UI compartida, notificaciones y presencia

- Creado `web/ui-notificaciones-presencia.md` con mapa de `apps/web/src/ui`, layouts home/admin, topbars, campanas, toasts, presencia web/mobile, tracking mobile y alertas app.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: Integracion Winbo.
- Hallazgos: `NotificationsRealtime` y `NotificationsBell` comparten listener contra `notificaciones`; `AlertasAppBell` escucha `alertas_app` del dia y responde por API server; presencia web/mobile escribe `usuarios_presencia` via Admin SDK.
- Riesgos destacados: listener cliente de `alertas_app` depende de rules explicitas, logs de debug en notificaciones, mojibake en textos de alertas/ticker y ausencia documentada de offline por timeout.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecuto la app, emuladores, listeners reales, pruebas de Firebase Auth cliente ni escrituras contra Firestore.

## 2026-06-15 - Deep dive Cloud Run acta-engine

- Creado `cloudrun/acta-engine.md` con contrato de endpoints, runtime Docker/Gunicorn, autenticacion por `ENGINE_TOKEN`, algoritmo PyMuPDF/pyzbar e integracion con ruta web de renombrado de actas.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: UI compartida, notificaciones y presencia.
- Hallazgos: el motor externo participa despues de regex/streams/ZXING local y antes de IA; soporta modos `off`, `shadow` y `active`.
- Riesgos destacados: `ENGINE_TOKEN` vacio deja `/extract` abierto, configurar solo `ACTA_ENGINE_URL` activa modo `active`, no hay limite propio de request en Flask y `gunicorn --timeout 0` desactiva timeout del worker.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecutaron deploys, Cloud Run, emuladores, pruebas contra Storage ni llamadas reales al servicio.

## 2026-06-15 - Deep dive domain services y repositorios web

- Creado `web/domain-services.md` con mapa de 19 dominios bajo `apps/web/src/domain`, colecciones Firestore principales, consumidores y fronteras cliente/servidor.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: Cloud Run `acta-engine`.
- Hallazgos: `domain` mezcla repos Admin SDK, servicios, esquemas Zod, helpers puros y listeners cliente; `alertas-app/repo.ts` es cliente directo y conecta con pendiente de Firestore rules.
- Riesgos destacados: modulos grandes de inventario/liquidacion, cache local de cuadrillas en ordenes, duplicacion potencial entre repos/actions/API y `equipos/service.ts` como placeholder.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se ejecuto la app, tests, emuladores ni queries contra datos reales.

## 2026-06-15 - Deep dive rutas web protegidas

- Creado `web/routes.md` con layouts protegidos, guards, home por rol, navegacion, dominios principales y paginas sin guard propio.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: Domain services y repositorios web.
- Hallazgos: 110 paginas `page.tsx` bajo `(protected)`, 20 admin, 90 home; 13 sin guard propio, de las cuales 4 son aliases de garantias y 9 requieren revision.
- Riesgos: algunas paginas dependen solo del layout `requireAuth()` y de navegacion; `requirePermission` redirige a `/admin` incluso desde rutas home; `buildHomeNav` puede divergir de los page guards.
- Notion actualizado en hub `REDES Contexto Tecnico` con resumen de la unidad y siguiente paso.
- No se modifico codigo fuente ni se ejecuto la app.

## 2026-06-15 - Deep dive Firebase rules, colecciones e indexes

- Creado `firebase/auth-firestore-rules.md` con reglas Firestore, colecciones cubiertas, usos cliente directo, colecciones server/Admin SDK e indexes.
- Actualizado `firebase/functions.md` para enlazar la documentacion de reglas/indexes.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: rutas web protegidas por dominio de negocio.
- Hallazgos: reglas actuales son deny-by-default y solo permiten cliente directo para usuarios/accesos/catalogos/notificaciones; listeners cliente de `alertas_app` y `cuadrillas/{id}/stock` no tienen regla explicita.
- Confirmado que `firestore.indexes.json` solo versiona el indice compuesto de `notificaciones`.
- No se ejecutaron deploys, emuladores, queries contra datos reales ni cambios de configuracion.

## 2026-06-15 - Deep dive rutas import/preview de garantias

- Creado `web/garantias-import-preview.md` con contrato de `/preview`, `/import`, parser proveedor, colecciones y flujo hacia `garantiasCruceSync`.
- Actualizado `web/garantias-cruce.md` para enlazar la unidad de import/preview y registrar nuevos riesgos.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: Firebase rules, colecciones e indexes.
- Hallazgos: preview expone muestras con datos de cliente usando permiso de vista, `GERENCIA`/`SUPERVISOR` pueden importar por rol directo, el import toca el doc padre antes de insertar rows y podria disparar sync antes de que terminen los batches.
- No se ejecuto import, no se abrio `BBDD_M&D_01-06-2026.xlsx`, no se modifico codigo fuente ni datos.

## 2026-06-15 - Deep dive Firebase Functions + BigQuery garantias

- Creado `firebase/functions.md` con configuracion de functions, exportaciones, trigger `garantiasCruceSync`, destino BigQuery, reglas Firestore observadas y riesgos operativos.
- Creado `scripts/maintenance-scripts.md` con backfill de garantias, backfill instalaciones abril 2026, SQL de cruce/dashboard y orden operativo inferido.
- Confirmado que `scripts/backfill_garantias_cruce_bq.ts` y `firebase/functions/backfill_garantias_cruce_bq.ts` son identicos.
- Detectada divergencia entre backfills de instalaciones abril: variante raiz fija `location` y filtra `estado` en query; variante functions filtra `estado` en memoria y no fija location.
- Detectado riesgo de denominador antiguo en `bigquery_garantias_dashboard.sql` frente a `bigquery_update_vw_instalacion_garantia.sql`.
- Actualizados `INDEX.md`, `PENDIENTES.md` e `indexes/source-index.json`; siguiente unidad recomendada: rutas `import` y `preview` del cruce de garantias.
- No se ejecutaron scripts, queries, deploys, emuladores ni cambios de datos.

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
