# UI compartida, notificaciones y presencia - REDES

Actualizado: 2026-06-15.

Estado: **Revisar**. Esta unidad documenta los componentes compartidos de UI que viven bajo `apps/web/src/ui`, con foco en topbars, campanas, toasts, presencia web/mobile y alertas operativas.

## Alcance Leido

- `apps/web/src/ui/common/NotificationsRealtime.tsx`
- `apps/web/src/ui/common/NotificationsBell.tsx`
- `apps/web/src/ui/common/AlertasAppBell.tsx`
- `apps/web/src/ui/common/UserPresenceHeartbeat.tsx`
- `apps/web/src/ui/common/TabSessionGuard.tsx`
- `apps/web/src/ui/common/UserProvider.tsx`
- `apps/web/src/ui/common/Toaster.tsx`
- `apps/web/src/ui/home/Topbar.tsx`
- `apps/web/src/ui/admin/Topbar.tsx`
- `apps/web/src/ui/home/OrdenesImportTicker.tsx`
- `apps/web/src/app/(protected)/home/layout.tsx`
- `apps/web/src/app/(protected)/admin/layout.tsx`
- `apps/web/src/domain/notificaciones/repo.ts`
- `apps/web/src/domain/notificaciones/service.ts`
- `apps/web/src/domain/alertas-app/repo.ts`
- `apps/web/src/app/api/auth/presencia/route.ts`
- `apps/web/src/app/api/mobile/presencia/route.ts`
- `apps/web/src/app/api/mobile/alertas-app/route.ts`
- `apps/web/src/app/api/alertas-app/[id]/responder/route.ts`
- `apps/web/src/app/api/mobile/tracking/route.ts`

No se ejecuto la app, emuladores, listeners reales, pruebas de Firebase Auth cliente ni escritura contra Firestore.

## Estructura UI

`apps/web/src/ui` contiene 25 archivos revisados por inventario:

- `common`: componentes transversales de sesion, presencia, progreso, toasts, notificaciones y alertas.
- `admin`: sidebar/topbar y formularios de comunicados, permisos y roles.
- `home`: sidebar/topbar, ticker de avisos, perfil y formularios de usuarios.
- `LocalTime.tsx`: helper visual aislado.

Los layouts protegidos montan la infraestructura compartida:

- `home/layout.tsx` usa `UserProvider`, `RouteProgressBar`, `TabSessionGuard`, `UserPresenceHeartbeat`, `HomeTopbar` y `NotificationsRealtime`.
- `admin/layout.tsx` usa el mismo patron con `AdminTopbar` y `AdminSidebar`.

## Identidad De Usuario

`UserProvider` carga `/api/auth/me` con `cache: "no-store"` y mantiene cache en memoria de modulo:

- `cachedUser`
- `inflightUserPromise`

Los topbars usan `useUserIdentity()` para mostrar nombre corto e iniciales. Si no hay identidad cargada, caen al `uid` recibido por sesion server.

Observacion: la cache vive en memoria del cliente y no se invalida explicitamente al cambiar datos de usuario, roles o areas. El logout redirige y elimina sesion, pero no hay mecanismo propio de refresh de identidad dentro de una sesion larga.

## Presencia Web

Componentes/rutas:

- `UserPresenceHeartbeat` llama `POST /api/auth/presencia` al montar, cada 60 segundos, al recuperar foco y al volver visible la pestana.
- `Topbar` home/admin y `PerfilForm` llaman `DELETE /api/auth/presencia` durante logout o salida de perfil.
- `TabSessionGuard` controla tabs activas con `localStorage`/`sessionStorage`, marca tabs cada 15 segundos y puede cerrar sesion si detecta una apertura sin tab activa ni login reciente.

`/api/auth/presencia`:

- Requiere sesion web con `getServerSession`.
- Escribe `usuarios_presencia/{uid}` con:
  - `online`
  - `source: "WEB"`
  - `roles`
  - `areas`
  - `estadoAcceso`
  - `lastSeenAt`
  - `updatedAt`
- `DELETE` marca `online: false`.

## Presencia Mobile Y Tracking

`/api/mobile/presencia`:

- Usa `getMobileAuthContext`.
- Escribe `usuarios_presencia/{uid}` con `source: "MOBILE"`.
- `POST` marca online y `DELETE` marca offline.

`/api/mobile/tracking`:

- Requiere mobile auth y rol `TECNICO`, `SUPERVISOR` o `ADMIN`.
- Valida `lat` y `lng`.
- Para supervisor escribe ubicacion en `supervisores/{uid}` y subcoleccion `tracking`.
- Para tecnico/admin resuelve cuadrilla y escribe en `cuadrillas/{id}` y subcoleccion `tracking`.

Esto separa presencia global de ubicacion historica. Presencia queda en `usuarios_presencia`; tracking queda en `supervisores/*/tracking` o `cuadrillas/*/tracking`.

## Notificaciones Globales

Productores:

- `domain/notificaciones/service.ts` expone `addGlobalNotification`.
- Se encontraron muchos consumidores en server actions/API routes, entre ellos transferencias, ventas, ordenes, liquidacion, importaciones, asistencia programada, actas y Winbo.

Colecciones:

- `notificaciones`
- `notificaciones_reads`

`addGlobalNotification` escribe en `notificaciones` con `createdAt: FieldValue.serverTimestamp()`.

`listenGlobalNotifications`:

- Es cliente.
- Consulta `notificaciones` con:
  - `scope == "ALL"`
  - `estado == "ACTIVO"`
  - `orderBy(createdAt desc)`
  - `limit(n)`
- Por cada notificacion consulta `notificaciones_reads/{uid}_{notifId}` para calcular `read`.
- En error de snapshot loguea y devuelve lista vacia.

`NotificationsRealtime`:

- Escucha auth cliente con `onAuthStateChanged`.
- Llama `listenGlobalNotifications`.
- Dispara toast con Sonner para notificaciones no leidas.
- Evita toasts de backlog viejo al entrar.
- Limita rafagas a 3 toasts por snapshot.

`NotificationsBell`:

- Escucha las mismas notificaciones.
- Muestra contador de no leidas.
- Al abrir marca todas como leidas con update optimista.
- Permite abrir comprobantes para `DESPACHO`, `DEVOLUCION`, `VENTA`, `ACTAS_RECEPCION` y `DESPACHO_MANT`.

## Alertas App

Productor mobile:

- `POST /api/mobile/alertas-app`
- Requiere mobile auth y contexto tecnico.
- Tipos permitidos:
  - `CERRAR_RUTA`
  - `REQUIERE_ATENCION`
- Evita duplicado pendiente por `cuadrillaId + tipo`.
- Escribe `alertas_app` con `rolesDestino: ["GESTOR", "JEFATURA", "GERENCIA"]` y `ymd` America/Lima.

Consumidor web:

- `AlertasAppBell` se monta en `HomeTopbar` solo para admin o roles `GESTOR`, `JEFATURA`, `GERENCIA`.
- Escucha `alertas_app` del dia actual con `listenAlertasAppHoy`.
- Separa pendientes e historial.
- Reproduce sonido cuando aumenta la cantidad de pendientes.
- Responde con `POST /api/alertas-app/{id}/responder`.

Respuesta:

- Requiere sesion web habilitada.
- Permite admin o roles `GESTOR`, `JEFATURA`, `GERENCIA`.
- Cambia estado a `ACEPTADA` o `RECHAZADA`.
- Si acepta `CERRAR_RUTA`, actualiza `cuadrilla_estado_diario/{ymd}_{cuadrillaId}` con `estadoRuta: "RUTA_CERRADA"`.
- Notifica al tecnico en `notificaciones_tecnico/{cuadrillaId}/items`.

## Ticker De Avisos

`OrdenesImportTicker` vive en `HomeTopbar`:

- Consulta `/api/ordenes/import/last` cada 60 segundos.
- Muestra estado de ultima importacion de ordenes.
- Mezcla comunicados tipo banner devueltos por la API.

Esto funciona como canal visible de avisos livianos, distinto de la campana global y de alertas app.

## Relacion Con Firestore Rules

Esta unidad conecta con pendientes ya detectados en `firebase/auth-firestore-rules.md`:

- `notificaciones` y `notificaciones_reads` tienen reglas explicitas para lectura/marcado.
- `alertas_app` se escucha desde cliente, pero no se observo regla Firestore explicita en la unidad de rules.
- `usuarios_presencia` se escribe desde Admin SDK en rutas API, por lo que no necesita escritura directa cliente.
- `cuadrillas/*/tracking` y `supervisores/*/tracking` son escritura server/Admin SDK desde API mobile.

Riesgo principal: `AlertasAppBell` depende de listener cliente directo contra `alertas_app`; si rules siguen deny-by-default, la UI queda silenciosa y solo loguea el error.

## Riesgos Y Observaciones

- `listenGlobalNotifications` hace un `getDoc` por notificacion para saber si fue leida; con limite 20 es acotado, pero escala lineal por usuario/snapshot.
- `markAllNotificationsRead` escribe todos los IDs no leidos en un batch; hoy la campana limita a 20, pero conviene mantener ese limite controlado.
- Hay `console.log` de debug en listeners de notificaciones (`listenGlobalNotifications`, `NotificationsBell`, `markAllNotificationsRead`).
- `AlertasAppBell` y `domain/alertas-app/repo.ts` muestran textos/comentarios con mojibake en el archivo leido (`atenciÃ³n`, `SecciÃ³n`, simbolos de check), posible problema de encoding o lectura historica.
- `AlertasAppBell` recibe `uid` y `userRoles`, pero el listener actual no filtra por rol/uid; escucha todas las alertas del dia y la restriccion fuerte queda en montaje del componente y API de respuesta.
- `TabSessionGuard` puede cerrar sesion si localStorage/sessionStorage fallan o si no detecta tab activa fuera de la ventana de gracia; requiere cuidado con navegadores restrictivos.
- `UserProvider` no invalida cache de identidad en caliente.
- La presencia usa heartbeats, pero no se documento aun un job que marque offline por timeout si una pestana/app muere sin `DELETE`.

## Pendientes

- Definir y probar reglas Firestore para `alertas_app` si el listener cliente debe mantenerse.
- Decidir si `AlertasAppBell` debe filtrar por `rolesDestino` o si basta con montar solo para roles permitidos.
- Retirar o condicionar logs de debug en notificaciones antes de produccion.
- Revisar mojibake/textos corruptos en `AlertasAppBell`, `alertas-app/repo.ts`, `OrdenesImportTicker` y rutas relacionadas.
- Evaluar invalidacion o refresh de `UserProvider` ante cambios de perfil/roles.
- Documentar criterio de offline por timeout para `usuarios_presencia`.
- Medir costo/latencia del patron `notificaciones` + N lecturas de `notificaciones_reads`.
- Confirmar si `notificaciones_tecnico` pertenece a unidad mobile/ordenes o debe integrarse al mapa global de notificaciones.

