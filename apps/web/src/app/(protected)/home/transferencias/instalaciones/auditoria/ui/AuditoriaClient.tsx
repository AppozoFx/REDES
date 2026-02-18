"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type Auditoria = {
  requiere?: boolean;
  estado?: "pendiente" | "sustentada" | string;
  fotoPath?: string;
  fotoURL?: string;
  actualizadoEn?: any;
};

type EquipoRow = {
  id: string;
  SN?: string;
  equipo?: string;
  estado?: string;
  ubicacion?: string;
  cliente?: string;
  tecnicos?: string[] | string;
  observacion?: string;
  f_despacho?: any;
  auditoria?: Auditoria;
  detalleInstalacion?: any;
};

function asStr(v: any) {
  return String(v || "").trim();
}

function toSN(v: any) {
  return asStr(v).toUpperCase();
}

function tsToDate(v: any) {
  if (!v) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v: any) {
  const d = tsToDate(v);
  if (!d) return "-";
  return d.toLocaleDateString("es-PE");
}

function fmtDateTime(v: any) {
  const d = tsToDate(v);
  if (!d) return "";
  return d.toLocaleString("es-PE");
}

function addHyperlinksToColumn(ws: XLSX.WorkSheet, headerText: string) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  let colIndex: number | null = null;
  for (let c = 0; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr];
    if (cell && String(cell.v) === headerText) {
      colIndex = c;
      break;
    }
  }
  if (colIndex == null) return;

  for (let r = 1; r <= range.e.r; r += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: colIndex });
    const cell = ws[addr];
    if (cell && typeof cell.v === "string" && cell.v.startsWith("http")) {
      const url = cell.v;
      ws[addr] = { f: `HYPERLINK("${url}","Ver foto")`, v: "Ver foto" } as any;
    }
  }
}

export default function AuditoriaClient({ canEdit }: { canEdit: boolean }) {
  const [modo, setModo] = useState<"campo" | "instalados">("campo");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EquipoRow[]>([]);
  const [obsDraft, setObsDraft] = useState<Record<string, string>>({});

  const [filtroEstadoAud, setFiltroEstadoAud] = useState("todos");
  const [filtroEstadoGeneral, setFiltroEstadoGeneral] = useState("todos");
  const [filtroUbicacion, setFiltroUbicacion] = useState("todas");
  const [busqueda, setBusqueda] = useState("");

  const [fileName, setFileName] = useState("");
  const [snExcel, setSnExcel] = useState<string[]>([]);
  const [subiendoId, setSubiendoId] = useState("");

  const [fotoModal, setFotoModal] = useState<{ open: boolean; url: string; sn: string }>({
    open: false,
    url: "",
    sn: "",
  });

  async function cargar(nextMode = modo) {
    setLoading(true);
    try {
      const res = await fetch(`/api/instalaciones/auditoria/list?mode=${encodeURIComponent(nextMode)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      const items = (Array.isArray(body.items) ? body.items : []) as EquipoRow[];
      setRows(items);
      setObsDraft((prev) => {
        const next = { ...prev };
        for (const r of items) {
          if (next[r.id] === undefined) next[r.id] = asStr(r.observacion);
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar auditoria");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const baseParaListas = useMemo(() => {
    let out = [...rows];
    if (filtroEstadoAud !== "todos") {
      out = out.filter((r) => asStr(r.auditoria?.estado) === filtroEstadoAud);
    }
    return out;
  }, [rows, filtroEstadoAud]);

  const kpis = useMemo(() => {
    const total = baseParaListas.length;
    const pend = baseParaListas.filter((r) => asStr(r.auditoria?.estado || "pendiente") !== "sustentada").length;
    const sust = baseParaListas.filter((r) => asStr(r.auditoria?.estado) === "sustentada").length;
    return { total, pend, sust };
  }, [baseParaListas]);

  const avance = useMemo(() => {
    if (kpis.total <= 0) return 0;
    return Math.round((kpis.sust / kpis.total) * 1000) / 10;
  }, [kpis]);

  const ubicacionesDisponibles = useMemo(() => {
    return Array.from(new Set(baseParaListas.map((r) => asStr(r.ubicacion)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [baseParaListas]);

  const estadosGenerales = useMemo(() => {
    return Array.from(new Set(baseParaListas.map((r) => asStr(r.estado)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [baseParaListas]);

  const equiposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return baseParaListas.filter((r) => {
      const okUb = filtroUbicacion === "todas" ? true : asStr(r.ubicacion) === filtroUbicacion;
      const okEstado = filtroEstadoGeneral === "todos" ? true : asStr(r.estado) === filtroEstadoGeneral;
      const okQ =
        !q ||
        asStr(r.SN).toLowerCase().includes(q) ||
        asStr(r.equipo).toLowerCase().includes(q) ||
        asStr(r.ubicacion).toLowerCase().includes(q) ||
        asStr(r.cliente).toLowerCase().includes(q);
      return okUb && okEstado && okQ;
    });
  }, [baseParaListas, busqueda, filtroEstadoGeneral, filtroUbicacion]);

  async function onFile(file: File) {
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rowsExcel = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      const sns = Array.from(
        new Set(
          rowsExcel
            .map((r) => toSN(r.SN ?? r.sn ?? r.Sn ?? r["sn "] ?? r["SN "]))
            .filter(Boolean)
        )
      );
      if (!sns.length) {
        setFileName("");
        setSnExcel([]);
        toast.error("No se encontraron SN validos en el Excel");
        return;
      }
      setFileName(file.name);
      setSnExcel(sns);
      toast.success(`Leidos ${sns.length} SN`);
    } catch {
      toast.error("No se pudo leer el Excel");
    }
  }

  async function guardarObservaciones() {
    if (!canEdit) return;
    const changes: Array<{ id: string; observacion: string }> = [];
    for (const r of rows) {
      const nuevo = asStr(obsDraft[r.id]);
      const actual = asStr(r.observacion);
      if (nuevo !== actual) changes.push({ id: r.id, observacion: nuevo });
    }
    if (!changes.length) {
      toast.message("No hay cambios por guardar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_observaciones", changes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) => prev.map((r) => ({ ...r, observacion: asStr(obsDraft[r.id]) })));
      toast.success(`Observaciones guardadas (${body.saved || changes.length})`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron guardar observaciones");
    } finally {
      setSaving(false);
    }
  }

  async function marcarMasivo() {
    if (!canEdit) return;
    if (!snExcel.length) return toast.error("Primero carga un Excel");
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "marcar_masivo", sns: snExcel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      if (Array.isArray(body?.notFound) && body.notFound.length) {
        toast.message(`No encontrados: ${body.notFound.length}`);
      }
      setSnExcel([]);
      setFileName("");
      await cargar();
      toast.success(`Marcado masivo completado (${body.saved || 0})`);
    } catch (e: any) {
      toast.error(e?.message || "Fallo el marcado masivo");
    } finally {
      setSaving(false);
    }
  }

  async function limpiarUno(r: EquipoRow) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "limpiar_uno", id: r.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success(`SN ${asStr(r.SN) || r.id}: auditoria limpiada`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo limpiar");
    } finally {
      setSaving(false);
    }
  }

  async function nuevaAuditoria() {
    if (!canEdit) return;
    if (!window.confirm(`Esto limpiara la auditoria de ${rows.length} equipos. Continuar?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nueva_auditoria" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      await cargar();
      toast.success(`Nueva auditoria lista. Limpiados: ${body.cleaned || 0}`);
    } catch (e: any) {
      toast.error(e?.message || "Error al limpiar auditoria");
    } finally {
      setSaving(false);
    }
  }

  async function subirFoto(r: EquipoRow, file: File, marcarSustentado: boolean) {
    if (!canEdit) return;
    setSubiendoId(r.id);
    try {
      const fd = new FormData();
      fd.set("equipoId", r.id);
      fd.set("marcarSustentado", marcarSustentado ? "true" : "false");
      fd.set("file", file);
      const res = await fetch("/api/instalaciones/auditoria/photo", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                auditoria: {
                  ...(x.auditoria || {}),
                  requiere: true,
                  estado: body.estado || x.auditoria?.estado || "pendiente",
                  fotoPath: body.fotoPath,
                  fotoURL: body.fotoURL,
                  actualizadoEn: new Date().toISOString(),
                },
              }
            : x
        )
      );
      toast.success(marcarSustentado ? `SN ${asStr(r.SN)} sustentado` : "Foto actualizada");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir foto");
    } finally {
      setSubiendoId("");
    }
  }

  function exportManifest() {
    if (!equiposFiltrados.length) {
      toast.error("No hay filas para exportar");
      return;
    }
    if (modo === "campo") {
      const header = ["SN", "Equipo", "F. Despacho", "Tecnicos", "Ubicacion", "Estado", "Auditoria", "Observacion", "FotoURL"];
      const data = equiposFiltrados.map((e) => [
        asStr(e.SN || e.id),
        asStr(e.equipo),
        fmtDate(e.f_despacho),
        Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : asStr(e.tecnicos),
        asStr(e.ubicacion),
        asStr(e.estado),
        asStr(e.auditoria?.estado || "pendiente"),
        asStr(e.observacion),
        asStr(e.auditoria?.fotoURL),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
      addHyperlinksToColumn(ws, "FotoURL");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AUDITORIA_CAMPO");
      XLSX.writeFile(wb, `AUDITORIA-CAMPO-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Exportado (campo)");
      return;
    }

    const data = equiposFiltrados.map((e, idx) => {
      const l = e.detalleInstalacion || {};
      return {
        "N°": idx + 1,
        SN_Auditoria: asStr(e.SN || e.id),
        "Fecha Instalacion": fmtDate(l.fechaInstalacion),
        Cuadrilla: asStr(l.cuadrillaNombre),
        Cliente: asStr(l.cliente || e.cliente),
        Direccion: asStr(l.direccion),
        Plan: asStr(l.plan),
        SN_ONT: asStr(l.snONT),
        SN_FONO: asStr(l.snFONO),
        "Estado Auditoria": asStr(e.auditoria?.estado || "pendiente"),
        "Observacion Auditoria": asStr(obsDraft[e.id] ?? e.observacion),
        "FotoURL Auditoria": asStr(e.auditoria?.fotoURL),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    addHyperlinksToColumn(ws, "FotoURL Auditoria");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AUDITORIA_INSTALADOS");
    XLSX.writeFile(wb, `AUDITORIA-INSTALADOS-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado (instalados)");
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Perfil en solo lectura: puedes visualizar auditoria, sin cambios.
        </div>
      )}

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Control de Auditoria</div>
            <div className="text-xs text-slate-500">Seguimiento de equipos pendientes y sustentados</div>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setModo("campo")}
              className={`rounded-full px-3 py-1 ${modo === "campo" ? "bg-white shadow" : ""}`}
            >
              Equipos en campo
            </button>
            <button
              type="button"
              onClick={() => setModo("instalados")}
              className={`rounded-full px-3 py-1 ${modo === "instalados" ? "bg-white shadow" : ""}`}
            >
              Equipos instalados
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs text-slate-500">En auditoria</div>
            <div className="text-2xl font-semibold">{kpis.total}</div>
          </div>
          <div className="rounded-xl border bg-amber-50 p-3">
            <div className="text-xs text-amber-700">Pendientes</div>
            <div className="text-2xl font-semibold text-amber-800">{kpis.pend}</div>
          </div>
          <div className="rounded-xl border bg-emerald-50 p-3">
            <div className="text-xs text-emerald-700">Sustentadas</div>
            <div className="text-2xl font-semibold text-emerald-800">{kpis.sust}</div>
          </div>
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Avance</span>
              <span>{avance}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, avance))}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado auditoria</label>
            <select className="w-full rounded border px-2 py-2 text-sm" value={filtroEstadoAud} onChange={(e) => setFiltroEstadoAud(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="sustentada">Sustentada</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado general</label>
            <select className="w-full rounded border px-2 py-2 text-sm" value={filtroEstadoGeneral} onChange={(e) => setFiltroEstadoGeneral(e.target.value)}>
              <option value="todos">Todos</option>
              {estadosGenerales.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Ubicacion</label>
            <select className="w-full rounded border px-2 py-2 text-sm" value={filtroUbicacion} onChange={(e) => setFiltroUbicacion(e.target.value)}>
              <option value="todas">Todas</option>
              {ubicacionesDisponibles.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Buscar</label>
            <input
              className="w-full rounded border px-2 py-2 text-sm"
              placeholder="SN, equipo, ubicacion o cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm hover:bg-slate-50"
            onClick={() => {
              setFiltroEstadoAud("todos");
              setFiltroEstadoGeneral("todos");
              setFiltroUbicacion("todas");
              setBusqueda("");
            }}
          >
            Limpiar filtros
          </button>
          <button type="button" onClick={cargar} className="rounded border px-3 py-2 text-sm hover:bg-slate-50" disabled={loading}>
            Actualizar
          </button>
          <button type="button" onClick={exportManifest} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
            Exportar Excel
          </button>
          {canEdit && (
            <>
              <button type="button" onClick={guardarObservaciones} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800" disabled={saving}>
                Guardar cambios
              </button>
              <button type="button" onClick={nuevaAuditoria} className="rounded bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900" disabled={saving}>
                Nueva auditoria
              </button>
            </>
          )}
        </div>

        {canEdit && (
          <div className="mt-4 rounded-xl border p-3">
            <div className="mb-2 text-sm font-semibold">Carga masiva por SN</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">
                Cargar Excel (SN)
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={marcarMasivo}
                disabled={!snExcel.length || saving}
                className="rounded bg-fuchsia-600 px-3 py-2 text-sm text-white hover:bg-fuchsia-700 disabled:opacity-50"
              >
                Marcar SN {snExcel.length ? `(${snExcel.length})` : ""}
              </button>
              {fileName && <div className="text-xs text-slate-500">Archivo: {fileName}</div>}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-slate-600">Cargando auditoria...</div>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[1180px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-600">
                <tr>
                  <th className="p-2">SN</th>
                  <th className="p-2">Equipo</th>
                  <th className="p-2">{modo === "instalados" ? "F. Instalacion" : "F. Despacho"}</th>
                  <th className="p-2">{modo === "instalados" ? "Cliente" : "Tecnicos"}</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">{modo === "instalados" ? "Direccion" : "Ubicacion"}</th>
                  <th className="p-2">Auditoria</th>
                  <th className="p-2">Foto</th>
                  <th className="p-2">Observacion</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equiposFiltrados.map((r) => {
                  const liq = r.detalleInstalacion || {};
                  const estadoAud = asStr(r.auditoria?.estado || "pendiente");
                  const pendiente = estadoAud !== "sustentada";
                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50/70">
                      <td className="p-2 font-mono text-xs">{asStr(r.SN || r.id)}</td>
                      <td className="p-2">{asStr(r.equipo) || "-"}</td>
                      <td className="p-2">{modo === "instalados" ? fmtDate(liq.fechaInstalacion) : fmtDate(r.f_despacho)}</td>
                      <td className="p-2">
                        {modo === "instalados"
                          ? asStr(liq.cliente || r.cliente) || "-"
                          : Array.isArray(r.tecnicos)
                          ? r.tecnicos.join(", ")
                          : asStr(r.tecnicos) || "-"}
                      </td>
                      <td className="p-2">{asStr(r.estado) || "-"}</td>
                      <td className="p-2">{modo === "instalados" ? asStr(liq.direccion) || "-" : asStr(r.ubicacion) || "-"}</td>
                      <td className="p-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                            pendiente ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {estadoAud}
                        </span>
                      </td>
                      <td className="p-2">
                        {asStr(r.auditoria?.fotoURL) ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs text-blue-700 hover:underline"
                              title={fmtDateTime(r.auditoria?.actualizadoEn)}
                              onClick={() =>
                                setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })
                              }
                            >
                              Ver foto
                            </button>
                            <img
                              src={asStr(r.auditoria?.fotoURL)}
                              alt={`foto-${asStr(r.SN || r.id)}`}
                              className="h-10 w-10 cursor-pointer rounded border object-cover"
                              onClick={() => setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin foto</span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          className="h-8 w-full min-w-[180px] rounded border px-2 text-xs disabled:bg-slate-100"
                          disabled={!canEdit}
                          value={obsDraft[r.id] ?? ""}
                          onChange={(e) => setObsDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Observacion"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {canEdit && (
                            <>
                              <input
                                id={`file-aud-${r.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={subiendoId === r.id}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file) {
                                    subirFoto(r, file, pendiente);
                                    ev.target.value = "";
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className={`h-7 rounded px-3 text-xs text-white ${
                                  pendiente ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"
                                }`}
                                disabled={subiendoId === r.id}
                                onClick={() => document.getElementById(`file-aud-${r.id}`)?.click()}
                              >
                                {subiendoId === r.id ? "Subiendo..." : pendiente ? "Sustentar" : "Actualizar foto"}
                              </button>
                              <button
                                type="button"
                                className="h-7 rounded bg-slate-700 px-3 text-xs text-white hover:bg-slate-800"
                                onClick={() => limpiarUno(r)}
                                disabled={saving}
                              >
                                Limpiar
                              </button>
                            </>
                          )}
                          {!canEdit && <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!equiposFiltrados.length && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-sm text-slate-500">
                      No hay equipos para mostrar con el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fotoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFotoModal({ open: false, url: "", sn: "" })}>
          <div className="relative w-[92vw] max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-medium text-slate-700">Foto auditoria - SN {fotoModal.sn}</div>
              <button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => setFotoModal({ open: false, url: "", sn: "" })}>
                Cerrar
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 p-3">
              <img src={fotoModal.url} alt={`foto-${fotoModal.sn}`} className="max-h-[75vh] rounded object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

