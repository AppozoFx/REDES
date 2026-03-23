import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseWinboOrdenesExport } from "./exportParser";

test("parseWinboOrdenesExport detects a header row and parses data rows", () => {
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
});
