import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseWinboOrdenesExport } from "./exportParser.ts";
import { mapWinboRowsToOrdenImport } from "./mappers.ts";

function runParserTest() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Reporte WinBo"],
    ["Generado", "2026-03-15"],
    ["Orden", "Cliente", "Estado", "Direccion"],
    ["ORD-1", "Cliente 1", "PENDIENTE", "Av 1"],
    ["ORD-2", "Cliente 2", "FINALIZADA", "Av 2"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const parsed = parseWinboOrdenesExport(buf);
  assert.equal(parsed.sheetName, "Export");
  assert.equal(parsed.rowsValidas, 2);
  assert.equal(String(parsed.rows[0].orden), "ORD-1");
  assert.equal(String(parsed.rows[1].cliente), "Cliente 2");
}

function runMapperTest() {
  const mapped = mapWinboRowsToOrdenImport([
    {
      __rowNumber: 4,
      orden: "ORD-99",
      cliente: "Cliente Demo",
      estado: "PENDIENTE",
      direccion: "Calle 123",
      telefono: "999999999",
      fechavisitafin: "15/03/2026 10:30",
    },
  ]);

  assert.equal(mapped.invalidos, 0);
  assert.equal(mapped.payloads.length, 1);
  assert.equal(mapped.payloads[0].ordenId, "ORD-99");
  assert.equal(mapped.payloads[0].cliente, "Cliente Demo");
  assert.equal(mapped.payloads[0].estado, "PENDIENTE");

  const fullMapped = mapWinboRowsToOrdenImport([
    {
      __rowNumber: 6,
      ordenid: "ORD-100",
      tipoordenservicio: "INSTALACION",
      tipotrabajo: "ALTA",
      fechasolicitud: "15/03/2026 08:00",
      nombrecliente: "Cliente Completo",
      tipo: "Residencial",
      tipocliente: "DNI",
      cuadrillanombre: "K1 MOTOWIN",
      estadoorden: "PENDIENTE",
      direccionprincipal: "Av Principal 123",
      direccionsecundaria: "Ref. Parque",
      identservicio: "PLAN 200MB",
      region: "LIMA",
      zonadistrito: "SURCO",
      codigoseguimientocliente: "COD-1",
      numerodocumento: "44556677",
      telemovilnume: "987654321",
      fechavisitafin: "15/03/2026 10:30",
      fechavisitainicio: "15/03/2026 09:00",
      motivocancelacion: "Sin motivo",
      georeferencia: "-12.1,-77.0",
    },
  ]);

  assert.equal(fullMapped.invalidos, 0);
  assert.equal(fullMapped.payloads[0].telefono, "987654321");
  assert.equal(fullMapped.payloads[0].tipoOrden, "INSTALACION");
  assert.equal(fullMapped.payloads[0].tipoTraba, "ALTA");
  assert.equal(fullMapped.payloads[0].cliente, "Cliente Completo");
  assert.equal(fullMapped.payloads[0].numeroDocumento, "44556677");
  assert.equal(fullMapped.payloads[0].georeferencia, "-12.1,-77.0");

  const invalid = mapWinboRowsToOrdenImport([{ __rowNumber: 8, cliente: "Sin orden" }]);
  assert.equal(invalid.invalidos, 1);
  assert.equal(invalid.payloads.length, 0);
  assert.equal(invalid.issues[0]?.code, "ORDEN_ID_REQUIRED");
}

runParserTest();
runMapperTest();
console.log("winbo tests: ok");
