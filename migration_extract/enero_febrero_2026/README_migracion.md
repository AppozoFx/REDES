# README_migracion

## Archivos generados
- `liquidacion_instalaciones_raw_enero_febrero_2026.json`
- `liquidacion_instalaciones_raw_enero_febrero_2026.csv`
- `instalaciones_import_enero_febrero_2026.csv`
- `mapping_liquidacion_to_instalaciones.md`
- `summary_enero_febrero_2026.md`

## Pasos sugeridos para import en proyecto nuevo
1. Revisar `summary_enero_febrero_2026.md` y validar conteos/rango de fechas.
2. Revisar `mapping_liquidacion_to_instalaciones.md` con el equipo funcional.
3. Cargar `instalaciones_import_enero_febrero_2026.csv` en ambiente de prueba (dry-run).
4. Validar 30-50 registros al azar comparando origen JSON vs destino.
5. Ejecutar carga en produccion y reconciliar conteos por `codigoCliente` y `liquidacion.estado`.

## Regla de fechas aplicada
- Filtro por `fechaLiquidacion` en zona `America/Lima` (UTC-5), convertido a UTC para comparacion tecnica.