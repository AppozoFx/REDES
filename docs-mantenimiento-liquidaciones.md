# Mantenimiento Liquidaciones

## Objetivo

Crear un modulo `mantenimiento_liquidaciones` para registrar atenciones de mantenimiento, liquidar materiales desde stock de cuadrilla y exportar la informacion al Excel que se presenta a WIN.

La fuente funcional debe ser el sistema. El Excel queda como salida de exportacion, no como fuente principal de trabajo.

## Base real ya existente en el proyecto

### Cuadrillas

- La coleccion actual `cuadrillas` ya contiene cuadrillas de mantenimiento.
- El area se diferencia por `area = "MANTENIMIENTO"`.
- Ya existe listado de cuadrillas de mantenimiento en:
  - `apps/web/src/app/(protected)/home/mantenimiento/cuadrillas/page.tsx`
  - `apps/web/src/app/api/cuadrillas/list`

### Stock de mantenimiento por cuadrilla

- El stock de mantenimiento ya vive en:
  - `cuadrillas/{cuadrillaId}/stock`
- Ya existe consulta de stock por cuadrilla en:
  - `apps/web/src/app/api/mantenimiento/cuadrillas/stock-materiales/route.ts`
- Ya existe historial de despachos a cuadrilla en:
  - `apps/web/src/app/api/mantenimiento/cuadrillas/stock-materiales-history/route.ts`

### Movimientos de inventario

- Ya existe la coleccion `movimientos_inventario`.
- Mantenimiento ya usa movimientos con `area = "MANTENIMIENTO"`.
- Instalaciones ya usa movimientos y descuento desde `cuadrillas/{id}/stock` al liquidar:
  - `apps/web/src/app/(protected)/home/ordenes/liquidacion/actions.ts`

### Conclusion tecnica

Para `mantenimiento_liquidaciones` no se debe crear otra fuente de stock.

La liquidacion debe consumir materiales desde:

- `cuadrillas/{cuadrillaId}/stock`

Y debe registrar trazabilidad en:

- `movimientos_inventario`

## Modelo funcional

Cada documento de `mantenimiento_liquidaciones` representa una atencion liquidable de mantenimiento.

No representa el Excel completo. El Excel mensual se arma desde estos registros.

## Coleccion propuesta

### `mantenimiento_liquidaciones`

Campos principales:

- `ticketNumero: string`
- `codigoCaja: string`
- `fechaAtencionYmd: string`
- `fechaAtencionAt: Timestamp | null`
- `distrito: string`
- `cuadrillaId: string`
- `cuadrillaNombre: string`
- `coordinadorUid: string`
- `coordinadorNombre: string`
- `horaInicio: string`
- `horaFin: string`
- `causaRaiz: string`
- `solucion: string`
- `observacion: string`
- `estado: "BORRADOR" | "LISTO_PARA_LIQUIDAR" | "LIQUIDADO" | "CORRECCION_PENDIENTE" | "ANULADO"`
- `origen: "MANUAL" | "TELEGRAM" | "IMPORTADO"`
- `telegramTemplateId: string`
- `telegramMessageId: string`
- `payloadOriginal: Record<string, unknown> | null`
- `materialesConsumidos: MaterialLiquidado[]`
- `materialesSnapshot: MaterialLiquidado[]`
- `movimientoInventarioId: string`
- `exportadoWinAt: Timestamp | null`
- `exportadoWinBy: string`
- `audit.createdAt`
- `audit.createdBy`
- `audit.updatedAt`
- `audit.updatedBy`

### `MaterialLiquidado`

- `materialId: string`
- `descripcion: string`
- `unidadTipo: "UND" | "METROS"`
- `und: number`
- `metros: number`
- `precioUnitario: number`
- `total: number`
- `status: "OK"`

## Reglas de stock

### Regla principal

No descontar stock al crear el ticket.

El descuento se hace solo cuando el registro pasa a `LIQUIDADO`.

### Fuente de stock

La fuente de stock para liquidacion sera:

- `cuadrillas/{cuadrillaId}/stock`

No usar `almacen_stock` directamente en la liquidacion del ticket.

`almacen_stock` sigue siendo la fuente para abastecer cuadrillas, no para liquidar tickets.

### Regla de correccion

Si un ticket ya esta liquidado:

- no se debe volver a descontar todo
- se debe comparar el material anterior vs el nuevo
- se aplica solo la diferencia

Ejemplo:

- antes: `SMOV = 2`
- despues: `SMOV = 3`
- delta: `-1` del stock de cuadrilla

Ejemplo inverso:

- antes: `SMOV = 3`
- despues: `SMOV = 1`
- delta: `+2` al stock de cuadrilla

### Regla de anulacion

Si un ticket liquidado se anula:

- se revierte completamente el material liquidado al stock de cuadrilla
- se registra movimiento de anulacion

## Movimientos de inventario

Cada liquidacion confirmada debe crear un documento en `movimientos_inventario`.

### Tipo propuesto

- `area: "MANTENIMIENTO"`
- `tipo: "LIQUIDACION_MANTENIMIENTO"`

### Estructura sugerida

- `area: "MANTENIMIENTO"`
- `tipo: "LIQUIDACION_MANTENIMIENTO"`
- `liquidacionId: string`
- `ticketNumero: string`
- `origen: { type: "CUADRILLA", id: cuadrillaId }`
- `destino: { type: "TICKET", id: ticketNumero }`
- `itemsMateriales: MaterialLiquidado[]`
- `observacion: string`
- `createdAt`
- `createdBy`

Para correcciones:

- `tipo: "CORRECCION_LIQUIDACION_MANTENIMIENTO"`

Para anulaciones:

- `tipo: "ANULACION_LIQUIDACION_MANTENIMIENTO"`

## Estados y flujo

### 1. Borrador

Se crea un ticket con datos parciales:

- ticket
- fecha
- cuadrilla
- distrito
- causa raiz
- solucion
- horas
- materiales tentativos

No toca stock.

### 2. Listo para liquidar

Estado intermedio opcional si quieren control operativo.

Sirve para validar que la informacion ya esta completa antes de descontar stock.

### 3. Liquidado

Accion confirmada:

- valida stock
- descuenta stock de cuadrilla
- crea movimiento de inventario
- congela snapshot de materiales
- deja trazabilidad de usuario y fecha

### 4. Correccion pendiente

Se abre cuando una liquidacion ya confirmada necesita correccion.

Se debe resolver solo con una accion especifica de correccion.

### 5. Anulado

Se usa si la liquidacion no debe contar.

Debe revertir stock y dejar movimiento de anulacion.

## Pantallas propuestas

### 1. Lista principal

Ruta sugerida:

- `/home/mantenimiento/liquidaciones`

Debe parecerse a la vista operativa de instalaciones.

Filtros:

- mes
- fecha
- cuadrilla
- distrito
- ticket
- estado
- origen

Columnas:

- fecha
- ticket
- distrito
- cuadrilla
- hora inicio
- hora fin
- causa raiz
- estado
- materiales
- accion

### 2. Crear borrador

Ruta sugerida:

- `/home/mantenimiento/liquidaciones/new`

Formulario para registrar el ticket de trabajo y guardar informacion parcial.

### 3. Detalle / edicion

Ruta sugerida:

- `/home/mantenimiento/liquidaciones/[id]`

Debe permitir:

- editar campos base si sigue en borrador
- agregar y quitar materiales
- ver stock actual de la cuadrilla
- ver trazabilidad

### 4. Confirmar liquidacion

Accion desde detalle o lista:

- validar datos minimos
- validar stock
- liquidar

### 5. Corregir liquidacion

Accion separada:

- solo para registros `LIQUIDADO`
- recalcular delta
- ajustar stock
- registrar movimiento de correccion

### 6. Exportar Excel WIN

Accion desde lista:

- filtrar por mes
- exportar el formato mensual final

## Excel WIN

El Excel debe generarse desde `mantenimiento_liquidaciones`.

La tabla principal a reproducir es la tabla 4 de la hoja `Resumen de liquidaciones`.

Campos minimos observados:

- fecha de atencion
- distrito
- codigo de caja / ticket
- inicio de trabajos
- fin de trabajos
- causa raiz motivo
- solucion
- cuadrilla
- materiales

Ademas, a partir de la misma base se puede completar:

- resumen de trabajos
- materiales utilizados
- totales mensuales

## Integracion futura con Telegram

Desde el inicio se debe dejar soporte para automatizacion.

Campos reservados:

- `origen`
- `telegramTemplateId`
- `telegramMessageId`
- `payloadOriginal`

Flujo futuro esperado:

1. Telegram crea un ticket borrador.
2. Se precargan ticket, causa, solucion y materiales.
3. El usuario revisa y confirma.
4. El sistema liquida y exporta.

No se debe acoplar la primera version a Telegram. Solo dejar los campos y el flujo listo.

## API propuesta

### Lectura

- `GET /api/mantenimiento/liquidaciones/list`
  - lista filtrable

- `GET /api/mantenimiento/liquidaciones/detail?id=...`
  - detalle del ticket

- `GET /api/mantenimiento/liquidaciones/export?month=YYYY-MM`
  - genera Excel WIN

### Escritura

- `POST /api/mantenimiento/liquidaciones/create`
  - crea borrador

- `POST /api/mantenimiento/liquidaciones/update`
  - actualiza borrador

- `POST /api/mantenimiento/liquidaciones/liquidar`
  - confirma liquidacion y descuenta stock

- `POST /api/mantenimiento/liquidaciones/corregir`
  - corrige una liquidacion previa usando delta

- `POST /api/mantenimiento/liquidaciones/anular`
  - anula y revierte stock

## Validaciones criticas

### Validaciones de creacion

- ticketNumero requerido
- fechaAtencionYmd requerida
- cuadrillaId requerido

### Validaciones de liquidacion

- cuadrilla existente
- `cuadrilla.area === "MANTENIMIENTO"`
- stock suficiente para cada material
- no permitir liquidar dos veces el mismo registro

### Validaciones de correccion

- solo sobre registros `LIQUIDADO`
- recalculo obligatorio por delta
- registrar usuario, fecha y motivo

## Orden de desarrollo recomendado

### Fase 1

- esquema `mantenimiento_liquidaciones`
- lista principal
- formulario de borrador

### Fase 2

- detalle de liquidacion
- carga manual de materiales
- lectura de stock de cuadrilla

### Fase 3

- accion `liquidar`
- descuento desde `cuadrillas/{id}/stock`
- registro en `movimientos_inventario`

### Fase 4

- accion `corregir`
- manejo por delta
- accion `anular`

### Fase 5

- exportacion Excel WIN

### Fase 6

- preintegracion Telegram

## Decision final

La mejor base para desarrollar este modulo es:

- nueva coleccion funcional: `mantenimiento_liquidaciones`
- misma coleccion real de cuadrillas: `cuadrillas`
- mismo patron de descuento que instalaciones: `cuadrillas/{cuadrillaId}/stock`
- misma trazabilidad central: `movimientos_inventario`

Eso evita duplicidad, evita descuadres y deja el modulo listo para exportacion a WIN y futura automatizacion con Telegram.
