"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Instalacion = {
  id: string; // codigoCliente
  codigoCliente?: string;
  cliente?: string;
  documento?: string;
  telefono?: string;
  direccion?: string;
  plan?: string;
  tipo?: string;
  estado?: string;
  cuadrillaId?: string;
  cuadrillaNombre?: string;
  tipoCuadrilla?: string;
  fechaInstalacionYmd?: string;
  fechaInstalacionHm?: string;
  equiposInstalados?: Array<{ sn: string; tipo: string; proid?: string; descripcion?: string }>;
  equiposByTipo?: Record<string, number>;
  materialesConsumidos?: Array<{ materialId: string; und?: number; metros?: number }>;
  llamadas?: {
    estadoLlamada?: string;
    horaInicioLlamada?: string;
    horaFinLlamada?: string;
    observacionLlamada?: string;
  };
  liquidacion?: {
    observacion?: string;
    rotuloNapCto?: string;
    servicios?: {
      planGamer?: string;
      kitWifiPro?: string;
      servicioCableadoMesh?: string;
      cat5e?: number;
      cat6?: number;
      puntosUTP?: number;
    };
  };
  orden?: Record<string, any>;
};

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function norm(s: string | undefined | null) {
  return String(s || "").trim().toUpperCase();
}

function countByTipo(inst: Instalacion) {
  const byTipo = inst.equiposByTipo || {};
  if (Object.keys(byTipo).length) return byTipo;
  const out: Record<string, number> = {};
  for (const e of inst.equiposInstalados || []) {
    const t = norm(e.tipo || "UNKNOWN");
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function safeNumber(v: any) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function valorONulo(v: any) {
  return v !== undefined && v !== "" ? v : null;
}

function buildExportRows(rows: Instalacion[]) {
  return rows.map((inst, idx) => {
    const equipos = inst.equiposInstalados || [];
    const ont = equipos.filter((e) => norm(e.tipo) === "ONT").map((e) => e.sn);
    const mesh = equipos.filter((e) => norm(e.tipo) === "MESH").map((e) => e.sn);
    const box = equipos.filter((e) => norm(e.tipo) === "BOX").map((e) => e.sn);
    const fono = equipos.filter((e) => norm(e.tipo) === "FONO").map((e) => e.sn);
    const proidONT = equipos.find((e) => norm(e.tipo) === "ONT")?.proid || "";

    const cat5e = safeNumber(inst.liquidacion?.servicios?.cat5e);
    const cat6 = safeNumber(inst.liquidacion?.servicios?.cat6);
    const puntos = safeNumber(inst.liquidacion?.servicios?.puntosUTP);
    const cableadoUTP = puntos > 0 ? puntos * 25 : "";

    const planGamer = String(inst.liquidacion?.servicios?.planGamer || "").trim();
    const kitWifiPro = String(inst.liquidacion?.servicios?.kitWifiPro || "").trim();
    const cableadoMesh = String(inst.liquidacion?.servicios?.servicioCableadoMesh || "").trim();

    const obsContrata = [
      cat5e > 0 ? `Se realizo ${cat5e} Cableado UTP Cat.5e` : "",
      planGamer ? "Se realizo Plan Gamer Cat.6" : "",
      kitWifiPro ? "KIT WIFI PRO" : "",
      cableadoMesh ? "SERVICIO CABLEADO DE MESH" : "",
    ]
      .filter(Boolean)
      .join(" + ");

    const orden = inst.orden || {};
    const actaVal = Array.isArray(orden.acta)
      ? orden.acta.filter(Boolean).join(", ")
      : valorONulo(orden.acta);
    const metraje = valorONulo(orden.metraje_instalado ?? orden.metrajeInstalado);

    return {
      "N°": idx + 1,
      "Fecha Instalación": inst.fechaInstalacionYmd || "",
      "Tipo de Servicio": "INSTALACION",
      "Nombre de Partida": "Ultima Milla",
      "Cuadrilla": valorONulo(inst.cuadrillaNombre || inst.cuadrillaId),
      "Acta": actaVal,
      "Codigo Cliente": valorONulo(inst.codigoCliente || inst.id),
      "Documento": valorONulo(inst.documento || orden.numeroDocumento),
      "Cliente": valorONulo(inst.cliente),
      "Direccion": valorONulo(inst.direccion),
      "Tipo Zona": valorONulo(orden.residencialCondominio || orden.tipoZona),
      "Plan": valorONulo(inst.plan || orden.plan || orden.idenServi),
      "SN_ONT": valorONulo(ont[0]),
      "proid": valorONulo(proidONT),
      "SN_MESH(1)": valorONulo(mesh[0]),
      "SN_MESH(2)": valorONulo(mesh[1]),
      "SN_MESH(3)": valorONulo(mesh[2]),
      "SN_MESH(4)": valorONulo(mesh[3]),
      "SN_BOX(1)": valorONulo(box[0]),
      "SN_BOX(2)": valorONulo(box[1]),
      "SN_BOX(3)": valorONulo(box[2]),
      "SN_BOX(4)": valorONulo(box[3]),
      "SN_FONO": valorONulo(fono[0]),
      "metraje_instalado": metraje,
      "Cantidad mesh": mesh.filter(Boolean).length,
      "rotuloNapCto": valorONulo(inst.liquidacion?.rotuloNapCto),
      "Observacion de la contrata": obsContrata || "",
      "Cableado UTP (MTS)": cableadoUTP,
      "Observacion": valorONulo(inst.liquidacion?.observacion),
      "Plan Gamer": valorONulo(planGamer),
      "KitWifiPro": valorONulo(kitWifiPro),
      "Servicio Cableado Mesh": valorONulo(cableadoMesh),
      "Cat5e": cat5e === 0 ? "" : cat5e,
      "Cat6": cat6 === 0 ? "" : cat6,
      "Puntos UTP": puntos === 0 ? "" : puntos,
    };
  });
}

export function InstalacionesClient() {
  const [ym, setYm] = useState(todayLimaYm());
  const [ymd, setYmd] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Instalacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function run() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (ymd) params.set("ymd", ymd);
        else params.set("ym", ym || todayLimaYm());

        const res = await fetch(`/api/instalaciones/list?${params.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) setRows(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ym, ymd]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((r) => {
      const hay = `${r.codigoCliente || r.id} ${r.cliente || ""} ${r.documento || ""} ${r.cuadrillaNombre || ""} ${r.cuadrillaId || ""}`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    let ont = 0;
    let mesh = 0;
    let box = 0;
    let fono = 0;
    for (const inst of filtered) {
      const byTipo = countByTipo(inst);
      ont += Number(byTipo.ONT || 0);
      mesh += Number(byTipo.MESH || 0);
      box += Number(byTipo.BOX || 0);
      fono += Number(byTipo.FONO || 0);
    }
    return { total, ont, mesh, box, fono };
  }, [filtered]);

  function handleExportarExcel() {
    if (!filtered.length) return;
    const rows = buildExportRows(filtered);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instalaciones");
    const name = ymd ? `Instalaciones_${ymd}.xlsx` : `Instalaciones_${ym}.xlsx`;
    XLSX.writeFile(wb, name);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">Mes (Lima)</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => {
              setYm(e.target.value);
              setYmd("");
            }}
            className="rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Dia</label>
          <input
            type="date"
            value={ymd}
            onChange={(e) => setYmd(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-64">
          <label className="block text-sm mb-1">Buscar</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Codigo, cliente, documento, cuadrilla"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {loading ? "Cargando..." : `Total: ${kpis.total} | ONT: ${kpis.ont} | MESH: ${kpis.mesh} | BOX: ${kpis.box} | FONO: ${kpis.fono}`}
        </div>
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={handleExportarExcel}
            className="rounded border px-3 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={!filtered.length}
          >
            Exportar a Excel
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No hay instalaciones para el rango seleccionado.
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((inst) => {
          const byTipo = countByTipo(inst);
          const isOpen = openId === inst.id;
          return (
            <div key={inst.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-semibold">{inst.codigoCliente || inst.id}</div>
                  <div className="text-sm text-muted-foreground">
                    Cliente: {inst.cliente || "-"} | Documento: {inst.documento || "-"}
                  </div>
                  <div className="text-sm text-muted-foreground">Direccion: {inst.direccion || "-"}</div>
                  <div className="text-sm text-muted-foreground">Plan: {inst.plan || "-"}</div>
                  <div className="text-sm text-muted-foreground">
                    Cuadrilla: {inst.cuadrillaNombre || inst.cuadrillaId || "-"} | Fecha: {inst.fechaInstalacionYmd || "-"} {inst.fechaInstalacionHm || ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Estado: {inst.estado || "-"} | Tipo: {inst.tipo || "-"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">ONT: {byTipo.ONT || 0}</span>
                    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">MESH: {byTipo.MESH || 0}</span>
                    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">BOX: {byTipo.BOX || 0}</span>
                    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">FONO: {byTipo.FONO || 0}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() => setOpenId(isOpen ? null : inst.id)}
                >
                  {isOpen ? "Ocultar" : "Ver detalle"}
                </button>
              </div>

              {isOpen ? (
                <div className="rounded border bg-slate-50 p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Telefono:</span> {inst.telefono || "-"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tipo cuadrilla:</span> {inst.tipoCuadrilla || "-"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rotulo NAP/CTO:</span> {inst.liquidacion?.rotuloNapCto || "-"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Observacion:</span> {inst.liquidacion?.observacion || "-"}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded border bg-white p-2">
                      <div className="text-sm font-medium mb-1">Llamadas</div>
                      <div className="text-sm text-muted-foreground">Estado: {inst.llamadas?.estadoLlamada || "-"}</div>
                      <div className="text-sm text-muted-foreground">Inicio: {inst.llamadas?.horaInicioLlamada || "-"}</div>
                      <div className="text-sm text-muted-foreground">Fin: {inst.llamadas?.horaFinLlamada || "-"}</div>
                      <div className="text-sm text-muted-foreground">Obs: {inst.llamadas?.observacionLlamada || "-"}</div>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <div className="text-sm font-medium mb-1">Servicios</div>
                      <div className="text-sm text-muted-foreground">Plan Gamer: {inst.liquidacion?.servicios?.planGamer || "-"}</div>
                      <div className="text-sm text-muted-foreground">Kit Wifi Pro: {inst.liquidacion?.servicios?.kitWifiPro || "-"}</div>
                      <div className="text-sm text-muted-foreground">Cableado Mesh: {inst.liquidacion?.servicios?.servicioCableadoMesh || "-"}</div>
                      <div className="text-sm text-muted-foreground">Cat5e: {inst.liquidacion?.servicios?.cat5e ?? "-"}</div>
                      <div className="text-sm text-muted-foreground">Cat6: {inst.liquidacion?.servicios?.cat6 ?? "-"}</div>
                      <div className="text-sm text-muted-foreground">Puntos UTP: {inst.liquidacion?.servicios?.puntosUTP ?? "-"}</div>
                    </div>
                  </div>

                  <div className="rounded border bg-white p-2">
                    <div className="text-sm font-medium mb-2">Equipos instalados</div>
                    {inst.equiposInstalados && inst.equiposInstalados.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                        {inst.equiposInstalados.map((e) => (
                          <div key={`${e.tipo}-${e.sn}`} className="rounded border px-2 py-1">
                            <div className="font-medium">{e.tipo}</div>
                            <div className="text-muted-foreground">SN: {e.sn}</div>
                            {e.proid ? <div className="text-muted-foreground">proid: {e.proid}</div> : null}
                            {e.descripcion ? <div className="text-muted-foreground">{e.descripcion}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Sin equipos registrados.</div>
                    )}
                  </div>

                  <div className="rounded border bg-white p-2">
                    <div className="text-sm font-medium mb-2">Materiales consumidos</div>
                    {inst.materialesConsumidos && inst.materialesConsumidos.length > 0 ? (
                      <div className="flex flex-wrap gap-2 text-sm">
                        {inst.materialesConsumidos.map((m) => (
                          <span key={m.materialId} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                            {m.materialId}: {m.und ?? 0}{m.metros ? ` (${m.metros}m)` : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Sin materiales registrados.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
