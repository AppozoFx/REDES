"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useState, startTransition } from "react";
import { listMaterialesAction } from "./actions";

export default function ListClient() {
  const [q, setQ] = useState("");
  const [unidadTipo, setUnidadTipo] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [vendible, setVendible] = useState<string>("");
  const [data, run, pending] = useActionState(listMaterialesAction as any, { ok: true, items: [] } as any);

  useEffect(() => {
    const params = { q, unidadTipo: unidadTipo || undefined, area: area || undefined, vendible: vendible || undefined } as any;
    startTransition(() => (run as any)(params));
  }, [q, unidadTipo, area, vendible]);

  const items = (data as any)?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por id/nombre" className="rounded border px-2 py-1" />
        <select value={unidadTipo} onChange={(e) => setUnidadTipo(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Unidad: Todas</option>
          <option value="UND">UND</option>
          <option value="METROS">METROS</option>
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Área: Todas</option>
          <option value="INSTALACIONES">INSTALACIONES</option>
          <option value="AVERIAS">AVERIAS</option>
        </select>
        <select value={vendible} onChange={(e) => setVendible(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Vendible: Todos</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="px-2 py-1 text-left">ID</th>
              <th className="px-2 py-1 text-left">Nombre</th>
              <th className="px-2 py-1 text-left">Unidad</th>
              <th className="px-2 py-1 text-left">Vendible</th>
              <th className="px-2 py-1 text-left">Áreas</th>
              <th className="px-2 py-1 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m: any) => (
              <tr key={m.id} className="border-b">
                <td className="px-2 py-1 font-mono">{m.id}</td>
                <td className="px-2 py-1">{m.nombre}</td>
                <td className="px-2 py-1">{m.unidadTipo}</td>
                <td className="px-2 py-1">{m.vendible ? "Sí" : "No"}</td>
                <td className="px-2 py-1">{(m.areas || []).join(", ")}</td>
                <td className="px-2 py-1">
                  <a className="text-blue-700 hover:underline" href={`/home/materiales/${m.id}`}>Editar</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

