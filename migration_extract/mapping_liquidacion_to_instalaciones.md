# Mapping: liquidacion_instalaciones -> instalaciones (import template)

## Archivos
- Origen: `migration_extract/liquidacion_instalaciones_real.csv`
- Destino: `migration_extract/instalaciones_import_from_liquidacion.csv`

## Regla general
- Se importa por `id`/`codigoCliente` (ambos iguales al `codigoCliente` origen).
- Se usa merge (`batch.set(..., { merge: true })`) en `instalaciones`.
- Se replica servicios en `servicios.*` y `liquidacion.servicios.*` por compatibilidad con pantallas/acciones actuales.

## Mapeo principal
- `codigoCliente` -> `id`, `codigoCliente`, `orden.codiSeguiClien`
- `cliente` -> `cliente`, `orden.cliente`
- `documento` -> `documento`, `orden.numeroDocumento`
- `telefono` -> `telefono`, `orden.telefono`
- `direccion` -> `direccion`, `orden.direccion`, `orden.direccion1`
- `plan` -> `plan`, `orden.idenServi`
- `tipoServicio` -> `orden.tipoTraba`
- `residencialCondominio` -> `orden.tipoOrden`
- `tipoCuadrilla` -> `orden.tipoCuadrilla`
- `cuadrillaNombre` -> `cuadrillaNombre`, `orden.cuadrillaNombre`
- `coordinadorCuadrilla` -> `orden.coordinadorCuadrilla`
- `gestorCuadrilla` -> `orden.gestorCuadrilla`

## Fechas
- `fechaInstalacion` ->
  - `fechaInstalacionAt` (ISO)
  - `fechaInstalacionYmd` (`yyyy-MM-dd`)
  - `fechaInstalacionHm` (`HH:mm`)
  - `orden.fechaFinVisiAt`, `orden.fechaFinVisiYmd`, `orden.fechaFinVisiHm`
- `fechaLiquidacion` ->
  - `liquidacion.at` (ISO)
  - `liquidacion.ymd` (`yyyy-MM-dd`)
  - `liquidacion.hm` (`HH:mm`)

## Estado liquidacion
- `estadoLiquidacion` -> `liquidacion.estado`
- Normalizacion aplicada: `ToUpperInvariant()` (ejemplo: `Liquidado` -> `LIQUIDADO`).

## Equipos
- `snONT` -> `snONT`
- `proidONT` -> `proidONT`
- `snMESH` -> `snMESH`
- `snBOX` -> `snBOX`
- `snFONO` -> `snFONO`

## Servicios
- `planGamer` -> `servicios.planGamer` y `liquidacion.servicios.planGamer`
- `kitWifiPro` -> `servicios.kitWifiPro` y `liquidacion.servicios.kitWifiPro`
- `servicioCableadoMesh` -> `servicios.servicioCableadoMesh` y `liquidacion.servicios.servicioCableadoMesh`
- `cat5e` -> `servicios.cat5e` y `liquidacion.servicios.cat5e`
- `cat6` -> `servicios.cat6` y `liquidacion.servicios.cat6`
- `puntosUTP` -> `servicios.puntosUTP` y `liquidacion.servicios.puntosUTP`

## Materiales
- `acta` -> `ACTA` y `materialesLiquidacion.acta`
- `templadores` -> `materialesLiquidacion.templador`
- `hebillas` -> `materialesLiquidacion.anclajeP`
- `clevis` -> `materialesLiquidacion.clevi`
- `metraje_instalado` -> `materialesLiquidacion.bobinaMetros` y `metraje_instalado`

## Observaciones
- `rotuloNapCto` -> `liquidacion.rotuloNapCto`
- `observacion` -> `liquidacion.observacion`
- `corregido` -> `corregido` (solo referencia; no altera `correccionPendiente`).

## Import recomendado
1. Probar en dry-run (`/api/instalaciones/template/import` con `dryRun: true`, `allowCreate: false`).
2. Revisar `skippedInvalid` y `skippedMissing`.
3. Ejecutar real import.
4. Validar muestra en `/api/instalaciones/list` (sn, servicios, liquidacion y materiales).
