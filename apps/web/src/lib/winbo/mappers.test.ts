import test from "node:test";
import assert from "node:assert/strict";
import { mapWinboRowsToOrdenImport } from "./mappers";

test("mapWinboRowsToOrdenImport maps normalized rows to OrdenImportInput", () => {
  const result = mapWinboRowsToOrdenImport([
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

  assert.equal(result.invalidos, 0);
  assert.equal(result.payloads.length, 1);
  assert.equal(result.payloads[0].ordenId, "ORD-99");
  assert.equal(result.payloads[0].cliente, "Cliente Demo");
  assert.equal(result.payloads[0].estado, "PENDIENTE");
});

test("mapWinboRowsToOrdenImport keeps WinBo fields aligned with manual import semantics", () => {
  const result = mapWinboRowsToOrdenImport([
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

  assert.equal(result.invalidos, 0);
  assert.equal(result.payloads.length, 1);
  assert.deepEqual(
    {
      ordenId: result.payloads[0].ordenId,
      tipoOrden: result.payloads[0].tipoOrden,
      tipoTraba: result.payloads[0].tipoTraba,
      fSoli: result.payloads[0].fSoli instanceof Date,
      cliente: result.payloads[0].cliente,
      tipo: result.payloads[0].tipo,
      tipoClienId: result.payloads[0].tipoClienId,
      cuadrilla: result.payloads[0].cuadrilla,
      estado: result.payloads[0].estado,
      direccion: result.payloads[0].direccion,
      direccion1: result.payloads[0].direccion1,
      idenServi: result.payloads[0].idenServi,
      region: result.payloads[0].region,
      zonaDistrito: result.payloads[0].zonaDistrito,
      codiSeguiClien: result.payloads[0].codiSeguiClien,
      numeroDocumento: result.payloads[0].numeroDocumento,
      telefono: result.payloads[0].telefono,
      fechaFinVisi: result.payloads[0].fechaFinVisi instanceof Date,
      fechaIniVisi: result.payloads[0].fechaIniVisi instanceof Date,
      motivoCancelacion: result.payloads[0].motivoCancelacion,
      georeferencia: result.payloads[0].georeferencia,
    },
    {
      ordenId: "ORD-100",
      tipoOrden: "INSTALACION",
      tipoTraba: "ALTA",
      fSoli: true,
      cliente: "Cliente Completo",
      tipo: "Residencial",
      tipoClienId: "DNI",
      cuadrilla: "K1 MOTOWIN",
      estado: "PENDIENTE",
      direccion: "Av Principal 123",
      direccion1: "Ref. Parque",
      idenServi: "PLAN 200MB",
      region: "LIMA",
      zonaDistrito: "SURCO",
      codiSeguiClien: "COD-1",
      numeroDocumento: "44556677",
      telefono: "987654321",
      fechaFinVisi: true,
      fechaIniVisi: true,
      motivoCancelacion: "Sin motivo",
      georeferencia: "-12.1,-77.0",
    }
  );
});

test("mapWinboRowsToOrdenImport marks rows without ordenId as invalid", () => {
  const result = mapWinboRowsToOrdenImport([{ __rowNumber: 8, cliente: "Sin orden" }]);

  assert.equal(result.invalidos, 1);
  assert.equal(result.payloads.length, 0);
  assert.equal(result.issues[0]?.code, "ORDEN_ID_REQUIRED");
});
