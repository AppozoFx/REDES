# summary_enero_febrero_2026

## Parametros de extraccion
- Campo de corte principal: `fechaLiquidacion`
- Zona horaria de filtro: `America/Lima` (UTC-5)
- Desde local: `2026-01-01T00:00:00`
- Hasta local: `2026-02-17T23:59:59`
- Desde UTC usado: `2026-01-01T05:00:00.000Z`
- Hasta UTC usado: `2026-02-18T04:59:59.000Z`

## Conteos principales
- Total docs leidos (coleccion completa): 34998
- Total docs exportados en rango: 4888
- Docs con fechaLiquidacion invalida (excluidos por no evaluables): 9715
- Rango real minimo fechaLiquidacion exportada: 2026-01-02T04:28:45.209Z
- Rango real maximo fechaLiquidacion exportada: 2026-02-17T13:44:18.025Z
- Conteo de codigoCliente vacio: 0
- Conteo de fechaInstalacion invalida: 0
- Conteo de snONT vacio: 0

## Conteo por estadoLiquidacion
| estadoLiquidacion | cantidad |
|---|---:|
| Liquidado | 4207 |
| Pendiente | 681 |

## Validacion de encabezados CSV importable
- Encabezados esperados: 53
- Encabezados generados: 53
- Resultado: OK

## Nota de calidad obligatoria
- Vacios en `snFONO`, `snMESH`, `snBOX`, `planGamer`, `kitWifiPro`, `servicioCableadoMesh` se trataron como `no aplica/no instalado` y **no** como error.