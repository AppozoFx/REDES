# Cierre de cuadrillas via WinBo - REDES

Actualizado: 2026-07-05.

Estado: **En progreso, bloqueado por depuracion**. Automatizacion end-to-end (backend + UI) ya escrita y probada en vivo; el pipeline tecnico funciona pero WinBo devuelve `CUADRILLA_NO_ENCONTRADA_WINBO` para cuadrillas que existen y estan activas. Falta confirmar causa raiz antes de continuar con fases posteriores.

## Objetivo

Reemplazar el proceso manual repetitivo de desactivar una cuadrilla en WinBo (motivo "RETIRO DE CAMPO") por un flujo disparado desde una pagina en REDES: `/home/cuadrillas/cierre-winbo`.

## Archivos implicados

- `apps/web/src/lib/winbo/client.ts` — `createWinboSession()` (login + terminos y condiciones), helper `postJson`, `exportOrdenesXlsx()` (patron de sesion de referencia que si funciona en produccion; se comparo contra el flujo de cierre para descartar diferencias de inicializacion de sesion).
- `apps/web/src/lib/winbo/cuadrillasCierre.ts` — `parseCuadrillaRedesId`, `winboSearchName`, `winboNameRegex`, `parseGrillaRows`, `buscarCuadrillaWinbo`, `esHorarioValido`, `evidenciaCierreBase64`, `cerrarCuadrillaWinbo`, `listarAprobacionesCierre`, `buscarAprobacionDeCuadrilla`, `diaWinboHoyLima`, `ymdLima`.
- `apps/web/src/app/api/cuadrillas/winbo/cerrar/route.ts` — `POST` con `dryRun`, permiso `CUADRILLAS_CIERRE_WINBO`, evita reenvios el mismo dia via `winbo_cierres` (Firestore).
- `apps/web/src/app/(protected)/home/cuadrillas/cierre-winbo/page.tsx` y `CierreWinboClient.tsx` — UI: primero valida (dry run), luego cierra con confirmacion.

No se ejecutaron cambios de codigo en esta sesion; solo pruebas en vivo del usuario contra la pagina y analisis de evidencia.

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
- **Hipotesis mas probable, AUN SIN CONFIRMAR**: la cuenta configurada en `WINBO_USERNAME` (usada por el bot via `createWinboSession()`) tiene un alcance de visibilidad distinto al de la cuenta manual del usuario — posiblemente restringido por "Sector Operativo" (ej. K2 residencial pertenece a `LIMA - NORTE 2`, K2 moto a `LIMA - OESTE 3`; cada cuadrilla tiene su propio sector). Si la cuenta del bot no tiene esos sectores asignados, `cargarGrilla` no le devuelve esas filas aunque el termino de busqueda sea correcto y la cuenta manual si las vea.
- **Pregunta pendiente, no respondida por el usuario todavia**: ¿`WINBO_USERNAME` es la misma cuenta con la que el usuario entra manualmente a WinBo, o es una cuenta de sistema/API separada? Si es distinta, ¿tiene el mismo alcance de sectores/cuadrillas asignado?

### Caso K37_MOTO (prueba nueva, mismo sintoma)

- Prueba real via la pagina devolvio 404 (`CUADRILLA_NO_ENCONTRADA_WINBO` esperado segun `ERROR_STATUS` en la route).
- A diferencia de K2, aqui hay una segunda explicacion plausible: la grilla completa de WinBo revisada solo llega hasta K28. Es probable que **K37 simplemente no exista** como cuadrilla en WinBo, y que esto no tenga relacion con el problema de alcance de cuenta.
- Se le sugirio al usuario NO cambiar el formato del termino de busqueda (agregar `MOTOWIN M&D SGI` explicito) porque esa hipotesis ya fue descartada con el caso K2 (busqueda manual con termino corto si funciono).
- **Pendiente**: el usuario debe verificar manualmente en WinBo si `"K 37"` devuelve algun resultado, igual que hizo con K2. Esto permite distinguir entre "la cuadrilla no existe" (nada que arreglar) vs. "existe pero el bot no la ve" (refuerza la hipotesis de alcance de cuenta).

## Proximos pasos al retomar

1. Confirmar con el usuario si `WINBO_USERNAME` es la cuenta manual o una cuenta de sistema separada, y si tiene el mismo alcance de sectores/cuadrillas.
2. Pedir al usuario que verifique manualmente en WinBo si la cuadrilla `K 37` existe (busqueda simple, igual que con K2).
3. Si la cuenta del bot tiene alcance restringido -> coordinar con el usuario el uso de credenciales con acceso completo (solo cambio de variables de entorno; no requiere cambio de codigo).
4. Si la cuenta es la misma que la manual pero igual falla -> investigar diferencias de headers/sesion entre el navegador real y `postJson` (User-Agent, Origin, Referer) o algun paso de sesion adicional entre login y `cargarGrilla` que el navegador si dispara y el bot no.
5. Una vez resuelto el matching, retomar tareas pendientes de fases posteriores (aun no iniciadas):
   - Endpoint de verificacion de aprobacion: `POST /api/cuadrillas/winbo/cierres/verificar` (usa `listarAprobacionesCierre` / `buscarAprobacionDeCuadrilla`, ya implementados mas no consumidos por ninguna route).
   - Registrar el permiso RBAC `CUADRILLAS_CIERRE_WINBO` en Firestore (coleccion `roles`/`modulos`).
   - Agregar item de navegacion en `buildHomeNav`.
   - Cierre por lotes/grupos de cuadrillas.
   - Manejo de notificacion cuando el proveedor rechaza la solicitud de cambio.

## Seguridad

`WINBO_USERNAME`, `WINBO_PASSWORD` y `WINBO_CRON_TOKEN` son sensibles: no deben registrarse en logs, codigo ni documentacion con sus valores reales. Al inspeccionar `.env` solo listar nombres de variables, nunca valores.
