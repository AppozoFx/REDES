# Cierre de cuadrillas via WinBo - REDES

Actualizado: 2026-07-08.

Estado: **En progreso, bloqueado por depuracion**. Automatizacion end-to-end (backend + UI) ya escrita y probada en vivo. El bloqueo por `EsHorarioValido` ya se resolvio (se bajo de bloqueo duro a advertencia, ver seccion dedicada). Sigue pendiente `CUADRILLA_NO_ENCONTRADA_WINBO` para cuadrillas que existen y estan activas; nueva evidencia apunta a colision de sesiones concurrentes en WinBo en vez de alcance de cuenta restringido.

Confirmado en produccion (2026-07-08): el cierre manual desde la pagina funciona bien. Se retiro de la UI el aviso "Fuera de horario"/"Detalle tecnico (EsHorarioValido)" porque salia siempre y no aportaba (el `esHorarioValido()` y el comportamiento no bloqueante en `route.ts` NO se tocaron, solo se dejo de renderizar). Se agrego item de navegacion "Cierre Cuadrilla" en `buildHomeNav.ts` (seccion GESTION del sidebar) y se otorgo el permiso `CUADRILLAS_CIERRE_WINBO` al rol `GESTOR` en Firestore (`roles/GESTOR.permissions`), asi las gestoras ya pueden entrar sin ser admin.

## Objetivo

Reemplazar el proceso manual repetitivo de desactivar una cuadrilla en WinBo (motivo "RETIRO DE CAMPO") por un flujo disparado desde una pagina en REDES: `/home/cuadrillas/cierre-winbo`.

## Archivos implicados

- `apps/web/src/lib/winbo/client.ts` — `createWinboSession()` (login + terminos y condiciones), helper `postJson`, `exportOrdenesXlsx()` (patron de sesion de referencia que si funciona en produccion; se comparo contra el flujo de cierre para descartar diferencias de inicializacion de sesion).
- `apps/web/src/lib/winbo/cuadrillasCierre.ts` — `parseCuadrillaRedesId`, `winboSearchName`, `winboNameRegex`, `parseGrillaRows`, `buscarCuadrillaWinbo`, `esHorarioValido`, `evidenciaCierreBase64`, `cerrarCuadrillaWinbo`, `listarAprobacionesCierre`, `buscarAprobacionDeCuadrilla`, `diaWinboHoyLima`, `ymdLima`.
- `apps/web/src/app/api/cuadrillas/winbo/cerrar/route.ts` — `POST` con `dryRun`, permiso `CUADRILLAS_CIERRE_WINBO`, evita reenvios el mismo dia via `winbo_cierres` (Firestore). `EsHorarioValido` ya **no bloquea** el cierre (se removio el `409 WINBO_FUERA_DE_HORARIO`); el resultado sigue viajando en la respuesta como dato informativo.
- `apps/web/src/app/(protected)/home/cuadrillas/cierre-winbo/page.tsx` y `CierreWinboClient.tsx` — UI: primero valida (dry run), luego cierra con confirmacion. El aviso "Fuera de horario" ya no se muestra en la UI (se removio por ser siempre visible y confuso); el dato `horario` sigue viajando en la respuesta de la API pero no se renderiza.
- `apps/web/src/core/rbac/buildHomeNav.ts` — item de navegacion "Cierre Cuadrilla" (`/home/cuadrillas/cierre-winbo`), visible cuando `hasPerm(session, "CUADRILLAS_CIERRE_WINBO")`, tanto en la rama reducida de `GESTOR` como en la rama general.
- `apps/web/src/ui/home/Sidebar.tsx` — `getGroup()` mapea `/home/cuadrillas/cierre-winbo` a la seccion `GESTION` del sidebar.

## Resuelto: `EsHorarioValido` bajado de bloqueo duro a advertencia

- Sintoma original: un cierre manual exitoso en el sitio de WinBo, seguido casi de inmediato por un intento desde la pagina de REDES para una cuadrilla distinta, que la app bloqueo con "⛔ Fuera de horario".
- Se obtuvo el valor crudo real via el desplegable "Detalle tecnico (EsHorarioValido)" de la UI: la respuesta de WinBo es el string plano `"N"` (sin JSON ni base64 adicional).
- Diagnostico: el parser de `esHorarioValido()` en `cuadrillasCierre.ts` ya interpreta correctamente `"N"` como no-valido (no hay bug de parseo); el problema no era de lectura sino de que **WinBo permite el cierre manual en su propio sitio aunque `EsHorarioValido` devuelva `"N"`** — el campo es informativo, no una restriccion dura para la accion de cierre.
- Decision aplicada: se elimino el bloqueo duro `409 WINBO_FUERA_DE_HORARIO` en `route.ts` (el cierre se envia a WinBo sin importar el resultado de `EsHorarioValido`) y se cambio la UI para mostrarlo como advertencia no bloqueante en vez de impedimento.
- No se toco `esHorarioValido()` en si — su parser sigue igual porque ya funcionaba correctamente para lo que reporta.

## Convencion de nombres confirmada (REDES <-> WinBo)

- REDES `K{n}_RESIDENCIAL` <-> WinBo `K {n} M&D SGI <tecnico>`
- REDES `K{n}_MOTO` <-> WinBo `K {n} MOTOWIN M&D SGI <tecnico>`
- El sufijo (nombre del tecnico) varia y no participa en el matching.
- Confirmado con un volcado completo de la grilla "Cuadrillas Tecnicas" de WinBo (Estado "En servicio"): las cuadrillas tecnicas existentes van de **K1 a K28** unicamente (residencial + moto para cada numero). No hay evidencia de cuadrillas por encima de K28.

## Estrategia de matching implementada

- `winboSearchName(cuadrillaId)` devuelve un termino amplio `"K {n}"` (sin sufijo `M&D SGI`) para enviar como `Nombre` a `cargarGrilla`. Se eligio este formato porque se sospechaba que WinBo no matchea bien terminos con `&`.
- `winboNameRegex(cuadrillaId)` filtra localmente las filas devueltas con una regex anclada: `^K\s*{n}\s+(MOTOWIN\s+)?M&D\s+SGI(\s|$)` (con o sin `MOTOWIN` segun el tipo), para que `K 1` no matchee `K 11`/`K 15` ni la variante residencial matchee la MOTOWIN.

## Pipeline validado end-to-end

Login WinBo -> `cargarGrilla` -> parseo de filas (payload en base64 doble) -> matching local -> error handling con `candidatos`/`registros` cuando no hay match. Confirmado con multiples pruebas reales desde la pagina: el pipeline es tecnicamente correcto, el error que reporta es un reflejo fiel de lo que WinBo devuelve (no es un bug de parsing propio).

## Problema en investigacion: `CUADRILLA_NO_ENCONTRADA_WINBO`

### Caso K2_RESIDENCIAL (el mas investigado)

- El bot devuelve `candidatos: []`, `registros: "0"` buscando `"K 2"`.
- El usuario confirmo manualmente en el navegador de WinBo, buscando el mismo termino simple `"K 2"`, que SI existen y estan "En servicio": `K 2 M&D SGI GINO YOMAR REYES RAMIREZ` y `K 2 MOTOWIN M&D SGI JOSE MANUEL BOLIVAR MANZINI`.
- **Hipotesis descartada**: el caracter `&` rompe el matching de WinBo. Se cambio `winboSearchName` para enviar solo `"K {n}"` (sin `&`) y el resultado no cambio — ademas la busqueda manual con el mismo termino corto si funciono, lo que confirma que el formato del termino no es el problema.
- **Hipotesis descartada**: la cuadrilla no existe o esta inactiva. Confirmado visualmente en la grilla completa que si existe y esta activa.
- **Hipotesis de alcance de cuenta, debilitada**: se penso que `WINBO_USERNAME` (usada por `createWinboSession()`) podria ser una cuenta de sistema/API con "Sector Operativo" mas restringido que la cuenta manual del usuario. Se confirmo que `.env`, `.env.local` y `.env.production.local` usan **el mismo** `WINBO_USERNAME` (`CLOZADA`) y el mismo `WINBO_BASE_URL` en los tres — no hay una cuenta de bot separada con menor alcance; local y produccion pegan contra la misma cuenta y el mismo servidor WinBo.
- **Hipotesis nueva y mas fuerte (2026-07-07), AUN SIN CONFIRMAR**: colision de sesiones concurrentes en WinBo. `createWinboSession()` hace login fresco (`IniciarSesion`) en cada llamada; si WinBo solo permite una sesion activa por usuario, dos logins casi simultaneos con la misma cuenta (uno desde local, otro desde produccion) podrian invalidar silenciosamente la sesion "vieja". Como `buscarCuadrillaWinbo()` solo lanza error si `data.err` viene distinto de `"N"`, una sesion invalidada que responde con una grilla vacia (sin `err` explicito) se interpreta como "0 registros" en vez de un error de autenticacion.
- **Evidencia que sostiene la hipotesis nueva**: se repitio la busqueda de `K2_RESIDENCIAL` casi al mismo tiempo desde local y desde produccion. Local devolvio `candidatos: []`, `registros: "0"` (`CUADRILLA_NO_ENCONTRADA_WINBO`); produccion, para la misma cuadrilla, si la encontro (`K 2 M&D SGI GINO YOMAR REYES RAMIREZ`, `CuadriId 7998`). Mismo termino de busqueda, misma cuenta, mismo servidor, resultado distinto en cuestion de minutos — consistente con una colision de sesion, no con un problema permanente de alcance o de matching.
- **Pendiente de confirmar**: pedirle al usuario que repita la prueba de `K2_RESIDENCIAL` **solo en local**, sin tener abierta una sesion de WinBo en el navegador ni disparar llamadas a produccion al mismo tiempo. Si asi si la encuentra, confirma la colision de sesion como causa raiz.

### Caso K37_MOTO (prueba nueva, mismo sintoma)

- Prueba real via la pagina devolvio 404 (`CUADRILLA_NO_ENCONTRADA_WINBO` esperado segun `ERROR_STATUS` en la route).
- A diferencia de K2, aqui hay una segunda explicacion plausible: la grilla completa de WinBo revisada solo llega hasta K28. Es probable que **K37 simplemente no exista** como cuadrilla en WinBo, y que esto no tenga relacion con el problema de alcance de cuenta.
- Se le sugirio al usuario NO cambiar el formato del termino de busqueda (agregar `MOTOWIN M&D SGI` explicito) porque esa hipotesis ya fue descartada con el caso K2 (busqueda manual con termino corto si funciono).
- **Pendiente**: el usuario debe verificar manualmente en WinBo si `"K 37"` devuelve algun resultado, igual que hizo con K2. Esto permite distinguir entre "la cuadrilla no existe" (nada que arreglar) vs. "existe pero el bot no la ve" (refuerza la hipotesis de alcance de cuenta).

## Proximos pasos al retomar

1. Pedir al usuario que repita `K2_RESIDENCIAL` **solo en local**, sin sesion de WinBo abierta en el navegador ni llamadas a produccion en paralelo, para confirmar o descartar la colision de sesiones concurrentes.
2. Si se confirma la colision de sesion -> evaluar si vale la pena serializar los logins (ej. lock/mutex alrededor de `createWinboSession()` a nivel de proceso) o si en la practica nunca coincide con uso manual real y no amerita cambio de codigo.
3. Pedir al usuario que verifique manualmente en WinBo si la cuadrilla `K 37` existe (busqueda simple, igual que con K2) — sigue pendiente, sirve para descartar el caso aparte de "cuadrilla no existe" (K37 esta fuera del rango K1-K28 confirmado).
4. Si tras descartar la colision de sesion el problema persiste -> investigar diferencias de headers/sesion entre el navegador real y `postJson` (User-Agent, Origin, Referer) o algun paso de sesion adicional entre login y `cargarGrilla` que el navegador si dispara y el bot no.
5. Una vez resuelto el matching, retomar tareas pendientes de fases posteriores (aun no iniciadas):
   - Endpoint de verificacion de aprobacion: `POST /api/cuadrillas/winbo/cierres/verificar` (usa `listarAprobacionesCierre` / `buscarAprobacionDeCuadrilla`, ya implementados mas no consumidos por ninguna route).
   - ~~Registrar el permiso RBAC `CUADRILLAS_CIERRE_WINBO` en Firestore (coleccion `roles`/`modulos`).~~ Hecho 2026-07-08: agregado a `roles/GESTOR.permissions`. Falta evaluar si otros roles (COORDINADOR, SUPERVISOR, etc.) tambien lo necesitan.
   - ~~Agregar item de navegacion en `buildHomeNav`.~~ Hecho 2026-07-08.
   - Cierre por lotes/grupos de cuadrillas.
   - Manejo de notificacion cuando el proveedor rechaza la solicitud de cambio.

## Seguridad

`WINBO_USERNAME`, `WINBO_PASSWORD` y `WINBO_CRON_TOKEN` son sensibles: no deben registrarse en logs, codigo ni documentacion con sus valores reales. Al inspeccionar `.env` solo listar nombres de variables, nunca valores.
