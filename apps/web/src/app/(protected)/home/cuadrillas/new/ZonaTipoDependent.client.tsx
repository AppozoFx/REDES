"use client";
import * as React from "react";

function getZonaTipo(zonas: any[], id: string): string {
  const z = zonas.find((x) => x.id === id);
  return z ? z.tipo : "";
}

function firstZonaId(zonas: any[]): string {
  return zonas.length ? zonas[0].id : "";
}

export default function ZonaTipoDependent({ zonas }: { zonas: any[] }) {
  const [zonaId, setZonaId] = React.useState(() => firstZonaId(zonas));
  const tipo = getZonaTipo(zonas, zonaId);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div>
        <label className="text-sm">Zona</label>
        <select name="zonaId" className="ui-select-inline ui-select-inline ui-select" value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
          {zonas.map((z: any) => (
            <option key={z.id} value={z.id}>
              {z.id}
            </option>
          ))}
        </select>
      </div>
      <div className="self-end">
        <div className="text-sm opacity-70">Tipo zona</div>
        <div className="text-sm font-medium">{tipo || "-"}</div>
      </div>
    </div>
  );
}


