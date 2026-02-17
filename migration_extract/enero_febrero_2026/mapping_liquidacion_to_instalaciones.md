# mapping_liquidacion_to_instalaciones

| Origen liquidacion_instalaciones | Destino instalaciones_import | Transformacion |
|---|---|---|
| id(doc) | id | conservar |
| codigoCliente | codigoCliente | conservar |
| cliente | cliente | conservar |
| documento | documento | conservar |
| telefono | telefono | conservar |
| direccion | direccion | conservar |
| plan | plan | conservar |
| cuadrillaNombre | cuadrillaNombre | conservar |
| snONT | snONT | conservar |
| proidONT | proidONT | conservar |
| snMESH | snMESH | array -> JSON string |
| snBOX | snBOX | array -> JSON string |
| snFONO | snFONO | conservar (vacio permitido) |
| acta | ACTA | renombrar |
| codigoCliente | orden.codiSeguiClien | copiar |
| cliente | orden.cliente | copiar |
| documento | orden.numeroDocumento | copiar |
| telefono | orden.telefono | copiar |
| direccion | orden.direccion / orden.direccion1 | copiar |
| codigoCliente | orden.idenServi | copiar |
| tipoServicio | orden.tipoTraba / orden.tipoOrden | copiar |
| tipoCuadrilla | orden.tipoCuadrilla | copiar |
| cuadrillaNombre | orden.cuadrillaNombre | copiar |
| coordinadorCuadrilla | orden.coordinadorCuadrilla | copiar |
| gestorCuadrilla | orden.gestorCuadrilla | copiar |
| fechaInstalacion (fallback fechaLiquidacion) | orden.fechaFinVisiAt | Date -> ISO |
| fechaInstalacion (fallback fechaLiquidacion) | orden.fechaFinVisiYmd | Date -> yyyy-MM-dd (America/Lima) |
| fechaInstalacion (fallback fechaLiquidacion) | orden.fechaFinVisiHm | Date -> HH:mm (America/Lima) |
| fechaLiquidacion | liquidacion.at | Date -> ISO |
| fechaLiquidacion | liquidacion.ymd | Date -> yyyy-MM-dd (America/Lima) |
| fechaLiquidacion | liquidacion.hm | Date -> HH:mm (America/Lima) |
| estadoLiquidacion | liquidacion.estado | uppercase (LIQUIDADO/PENDIENTE/otros) |
| rotuloNapCto | liquidacion.rotuloNapCto | copiar |
| observacion | liquidacion.observacion | copiar |
| planGamer | servicios.planGamer + liquidacion.servicios.planGamer | copiar (vacio permitido) |
| kitWifiPro | servicios.kitWifiPro + liquidacion.servicios.kitWifiPro | copiar (vacio permitido) |
| servicioCableadoMesh | servicios.servicioCableadoMesh + liquidacion.servicios.servicioCableadoMesh | copiar (vacio permitido) |
| cat5e | servicios.cat5e + liquidacion.servicios.cat5e | int |
| cat6 | servicios.cat6 + liquidacion.servicios.cat6 | int |
| puntosUTP | servicios.puntosUTP + liquidacion.servicios.puntosUTP | int (fallback cat5e+cat6) |
| acta | materialesLiquidacion.acta | copiar |
| templadores | materialesLiquidacion.templador | int |
| (sin fuente) | materialesLiquidacion.anclajeP | vacio |
| clevis | materialesLiquidacion.clevi | int |
| metraje_instalado | materialesLiquidacion.bobinaMetros | float |
