"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type OptionItem = { uid: string; nombre: string };

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  telefono: string;
  telNorm: string;
  cuadrillaNombre: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaEnCamino: string;
  horaInicio: string;
  horaFin: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  estadoLlamada: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  observacionLlamada: string;
  icCount: number;
  icLatest: {
    usuaruioInconcert: string;
    inicioLlamadaInconcert: string;
    entraLlamadaInconcert: string;
    finLlamadaInconcert: string;
    duracion: string;
    bo: string;
    observacionInconcert: string;
  } | null;
};

type Filters = {
  gestor: string;
  coordinador: string;
  cuadrilla: string;
  estado: string;
  alerta: string;
  estadoLlamada: string;
  tramo: string;
  acciones: "" | "con" | "sin";
};

const initialFilters: Filters = {
  gestor: "",
  coordinador: "",
  cuadrilla: "",
  estado: "",
  alerta: "",
  estadoLlamada: "",
  tramo: "",
  acciones: "",
};

function currentLimaHms() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function GerenciaInconcertClient({ initialYmd }: { initialYmd: string }) {
  const [ymd, setYmd] = useState(initialYmd);
  const [clock, setClock] = useState(currentLimaHms());
  const [rows, setRows] = useState<Row[]>([]);
  const [gestores, setGestores] = useState<OptionItem[]>([]);
  const [coordinadores, setCoordinadores] = useState<OptionItem[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRanking, setShowRanking] = useState(false);
  const [modal, setModal] = useState<{ tel: string; list: any[] } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(currentLimaHms()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/inconcert/gerencia/list?ymd=${encodeURIComponent(ymd)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : []);
          setGestores(Array.isArray(data?.options?.gestores) ? data.options.gestores : []);
          setCoordinadores(Array.isArray(data?.options?.coordinadores) ? data.options.coordinadores : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ymd]);

  function outsideTolerance(inst: Row) {
    if (!inst.horaEnCamino || !inst.tramo || inst.tramo === "-") return false;
    const tramoHour =
      inst.tramo === "Primer Tramo" ? "08:00" : inst.tramo === "Segundo Tramo" ? "12:00" : inst.tramo === "Tercer Tramo" ? "16:00" : "";
    if (!tramoHour) return false;
    const ref = Date.parse(`2000-01-01T${tramoHour}:00`);
    const val = Date.parse(`2000-01-01T${inst.horaEnCamino}:00`);
    if (Number.isNaN(ref) || Number.isNaN(val)) return false;
    return val > ref + 15 * 60 * 1000;
  }

  function noGestion(inst: Row) {
    return inst.horaEnCamino === "-" && inst.horaInicio === "-" && inst.horaFin === "-";
  }

  function hasAccion(inst: Row) {
    return (inst.icCount || 0) > 0;
  }

  const filtered = useMemo(() => {
    const cuad = filters.cuadrilla.toLowerCase();
    return rows.filter((r) => {
      const byGestor = !filters.gestor || r.gestorUid === filters.gestor;
      const byCoord = !filters.coordinador || r.coordinadorUid === filters.coordinador;
      const byCuad = !cuad || r.cuadrillaNombre.toLowerCase().includes(cuad);
      const byEstado = !filters.estado || r.estado === filters.estado;
      const byTramo = !filters.tramo || r.tramo === filters.tramo;
      const byEstadoLlamada =
        !filters.estadoLlamada ||
        (filters.estadoLlamada === "noLlamo" && (r.estadoLlamada === "-" || !r.estadoLlamada)) ||
        r.estadoLlamada === filters.estadoLlamada;
      const byAccion =
        !filters.acciones ||
        (filters.acciones === "con" && hasAccion(r)) ||
        (filters.acciones === "sin" && !hasAccion(r));
      const byAlerta =
        !filters.alerta ||
        (filters.alerta === "tolerancia" && outsideTolerance(r)) ||
        (filters.alerta === "sinaction" && noGestion(r));
      return byGestor && byCoord && byCuad && byEstado && byTramo && byEstadoLlamada && byAccion && byAlerta;
    });
  }, [rows, filters]);

  const rankingData = useMemo(() => {
    const map = new Map<string, { gestor: string; nombre: string; total: number; con: number; sin: number; pct: number }>();
    for (const r of filtered) {
      const key = r.gestorUid || "SIN_GESTOR";
      const hit = map.get(key) || { gestor: key, nombre: r.gestorNombre || key, total: 0, con: 0, sin: 0, pct: 0 };
      hit.total += 1;
      if (hasAccion(r)) hit.con += 1;
      else hit.sin += 1;
      map.set(key, hit);
    }
    return Array.from(map.values())
      .map((x) => ({ ...x, pct: x.total ? Math.round((x.con * 100) / x.total) : 0 }))
      .sort((a, b) => b.pct - a.pct || b.con - a.con);
  }, [filtered]);

  const totalConAccion = filtered.filter(hasAccion).length;
  const totalSinAccion = filtered.length - totalConAccion;
  const totalFueraTolerancia = filtered.filter(outsideTolerance).length;
  const totalSinGestion = filtered.filter(noGestion).length;
  const pctConAccion = filtered.length ? Math.round((totalConAccion * 100) / filtered.length) : 0;

  async function openCalls(row: Row) {
    if (!row.telNorm) return;
    const res = await fetch(`/api/inconcert/gerencia/calls?tel=${encodeURIComponent(row.telNorm)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) return;
    setModal({ tel: row.telefono || row.telNorm, list: Array.isArray(data.list) ? data.list : [] });
  }

  function exportExcel() {
    const detail = filtered.map((r) => ({
      Cliente: r.cliente,
      CodigoCliente: r.codigoCliente,
      Documento: r.documento,
      Telefono: r.telefono,
      Cuadrilla: r.cuadrillaNombre,
      TipoServicio: r.tipoServicio,
      Tramo: r.tramo,
      Estado: r.estado,
      HoraEnCamino: r.horaEnCamino,
      HoraInicio: r.horaInicio,
      HoraFin: r.horaFin,
      Gestor: r.gestorNombre,
      EstadoLlamada: r.estadoLlamada,
      InicioLlamada: r.horaInicioLlamada,
      FinLlamada: r.horaFinLlamada,
      ObservacionLlamada: r.observacionLlamada,
      INC_Usuario: r.icLatest?.usuaruioInconcert || "",
      INC_Inicio: r.icLatest?.inicioLlamadaInconcert || "",
      INC_Entra: r.icLatest?.entraLlamadaInconcert || "",
      INC_Fin: r.icLatest?.finLlamadaInconcert || "",
      INC_Duracion: r.icLatest?.duracion || "",
      INC_BO: r.icLatest?.bo || "",
      INC_Observacion: r.icLatest?.observacionInconcert || "",
      TieneAccionIC: hasAccion(r) ? "Si" : "No",
    }));
    const ranking = rankingData.map((r) => ({
      GestorRef: r.gestor,
      Gestor: r.nombre,
      Total: r.total,
      ConLlamadas: r.con,
      SinLlamadas: r.sin,
      Porcentaje: `${r.pct}%`,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Reporte Gerencia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ranking), "Cumplimiento Gestor");
    XLSX.writeFile(wb, `REPORTE-GERENCIA-${ymd}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-center">InConcert - Vista Gerencia</h1>
      <p className="text-center text-sm text-muted-foreground">Hora actual Lima: {clock}</p>

      <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold">
        <div className="bg-slate-100 px-3 py-2 rounded">Total: {filtered.length}</div>
        <div className="bg-slate-100 px-3 py-2 rounded">Fuera tolerancia: {totalFueraTolerancia}</div>
        <div className="bg-slate-100 px-3 py-2 rounded">Sin gestion: {totalSinGestion}</div>
        <div className="bg-slate-100 px-3 py-2 rounded">Con llamadas: {totalConAccion}</div>
        <div className="bg-slate-100 px-3 py-2 rounded">Sin llamadas: {totalSinAccion}</div>
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between text-xs font-semibold mb-1">
          <span>Porcentaje con llamadas (registros IC)</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRanking((v) => !v)}
              className="px-3 py-1.5 rounded bg-slate-800 text-white"
            >
              {showRanking ? "Ocultar cumplimiento" : "Mostrar cumplimiento"}
            </button>
            <span>{pctConAccion}% ({totalConAccion}/{filtered.length || 0})</span>
          </div>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-slate-700 to-orange-500" style={{ width: `${pctConAccion}%` }} />
        </div>
      </div>

      {showRanking ? (
        <div className="mx-auto w-full max-w-5xl space-y-2">
          {rankingData.length === 0 ? (
            <div className="text-xs text-muted-foreground">No hay datos para ranking.</div>
          ) : (
            rankingData.map((g) => (
              <div key={g.gestor} className="rounded border bg-white p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.nombre}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100">{g.con}/{g.total} con llamadas</span>
                  </div>
                  <span className="font-bold">{g.pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-center">
        <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className="px-3 py-2 border rounded" />

        <select value={filters.gestor} onChange={(e) => setFilters((f) => ({ ...f, gestor: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todos los gestores</option>
          {gestores.map((g) => (
            <option key={g.uid} value={g.uid}>{g.nombre}</option>
          ))}
        </select>

        <select value={filters.coordinador} onChange={(e) => setFilters((f) => ({ ...f, coordinador: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todos los coordinadores</option>
          {coordinadores.map((c) => (
            <option key={c.uid} value={c.uid}>{c.nombre}</option>
          ))}
        </select>

        <select value={filters.tramo} onChange={(e) => setFilters((f) => ({ ...f, tramo: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todos los tramos</option>
          <option value="Primer Tramo">Primer Tramo</option>
          <option value="Segundo Tramo">Segundo Tramo</option>
          <option value="Tercer Tramo">Tercer Tramo</option>
        </select>

        <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todos los estados</option>
          <option value="Agendada">Agendada</option>
          <option value="En camino">En camino</option>
          <option value="Cancelada">Cancelada</option>
          <option value="Finalizada">Finalizada</option>
          <option value="Reprogramada">Reprogramada</option>
          <option value="Iniciada">Iniciada</option>
          <option value="Regestion">Regestion</option>
          <option value="Regestión">Regestion (con tilde)</option>
        </select>

        <select value={filters.estadoLlamada} onChange={(e) => setFilters((f) => ({ ...f, estadoLlamada: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todos los estados llamada</option>
          <option value="Contesto">Contesto</option>
          <option value="No Contesto">No Contesto</option>
          <option value="No se Registro">No se Registro</option>
          <option value="noLlamo">No se llamo</option>
        </select>

        <select value={filters.acciones} onChange={(e) => setFilters((f) => ({ ...f, acciones: e.target.value as any }))} className="px-3 py-2 border rounded">
          <option value="">Acciones: Todas</option>
          <option value="con">Acciones: Con llamadas</option>
          <option value="sin">Acciones: Sin llamadas</option>
        </select>

        <select value={filters.alerta} onChange={(e) => setFilters((f) => ({ ...f, alerta: e.target.value }))} className="px-3 py-2 border rounded">
          <option value="">Todas las alertas</option>
          <option value="tolerancia">Fuera de tolerancia</option>
          <option value="sinaction">Sin gestion</option>
        </select>

        <input
          value={filters.cuadrilla}
          onChange={(e) => setFilters((f) => ({ ...f, cuadrilla: e.target.value }))}
          placeholder="Buscar cuadrilla"
          className="px-3 py-2 border rounded"
        />

        <button type="button" onClick={exportExcel} className="px-3 py-2 rounded bg-slate-800 text-white">
          Exportar Excel
        </button>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="text-sm text-center text-muted-foreground">Cargando datos...</div> : null}

      <div className="relative max-h-[70vh] overflow-auto rounded border">
        <table className="w-full text-xs md:text-sm min-w-[2100px]">
          <thead className="sticky top-0 bg-slate-800 text-white z-10">
            <tr>
              {[
                "Cliente","Codigo","Documento","Telefono","Cuadrilla","Tipo Servicio","Tramo","Estado",
                "En Camino","Inicio","Fin","Gestor","Estado Llamada","Inicio Llamada","Fin Llamada","Observacion",
                "INC Usuario","INC Inicio","INC Entra","INC Fin","INC Duracion","INC BO","INC Observacion","Acciones",
              ].map((h) => (
                <th key={h} className="p-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={`border-b ${r.icCount > 0 ? "" : "bg-yellow-50"}`}>
                <td className="p-2">{r.cliente}</td>
                <td className="p-2">{r.codigoCliente}</td>
                <td className="p-2">{r.documento}</td>
                <td className="p-2">{r.telefono}</td>
                <td className="p-2">{r.cuadrillaNombre}</td>
                <td className="p-2">{r.tipoServicio}</td>
                <td className="p-2">{r.tramo}</td>
                <td className="p-2">{r.estado}</td>
                <td className="p-2">{r.horaEnCamino}</td>
                <td className="p-2">{r.horaInicio}</td>
                <td className="p-2">{r.horaFin}</td>
                <td className="p-2">{r.gestorNombre}</td>
                <td className="p-2">{r.estadoLlamada}</td>
                <td className="p-2">{r.horaInicioLlamada}</td>
                <td className="p-2">{r.horaFinLlamada}</td>
                <td className="p-2">{r.observacionLlamada}</td>
                <td className="p-2">{r.icLatest?.usuaruioInconcert || "-"}</td>
                <td className="p-2">{r.icLatest?.inicioLlamadaInconcert || "-"}</td>
                <td className="p-2">{r.icLatest?.entraLlamadaInconcert || "-"}</td>
                <td className="p-2">{r.icLatest?.finLlamadaInconcert || "-"}</td>
                <td className="p-2">{r.icLatest?.duracion || "-"}</td>
                <td className="p-2">{r.icLatest?.bo || "-"}</td>
                <td className="p-2">{r.icLatest?.observacionInconcert || "-"}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCalls(r)}
                      disabled={!r.icCount}
                      className={`px-2 py-1 rounded text-white ${r.icCount ? "bg-indigo-700" : "bg-indigo-400"}`}
                    >
                      Ver llamadas ({r.icCount})
                    </button>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${r.icCount ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {r.icCount ? "Con llamadas" : "Sin llamadas"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={24} className="text-center py-4 text-muted-foreground">No hay resultados con los filtros aplicados</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full mx-4">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Llamadas InConcert - Tel: <span className="font-mono">{modal.tel}</span></h3>
              <button type="button" className="px-3 py-1 rounded bg-slate-700 text-white" onClick={() => setModal(null)}>
                Cerrar
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              <table className="w-full text-xs md:text-sm border">
                <thead className="bg-slate-100">
                  <tr>
                    {["Usuario","Inicio","Entra","Fin","Duracion","Espera","Timbrado","Atencion","BO","Observacion"].map((h) => (
                      <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modal.list.map((r: any) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.usuaruioInconcert || "-"}</td>
                      <td className="p-2">{r.inicioLlamadaInconcert || "-"}</td>
                      <td className="p-2">{r.entraLlamadaInconcert || "-"}</td>
                      <td className="p-2">{r.finLlamadaInconcert || "-"}</td>
                      <td className="p-2">{r.duracion || "-"}</td>
                      <td className="p-2">{r.espera || "-"}</td>
                      <td className="p-2">{r.timbrado || "-"}</td>
                      <td className="p-2">{r.atencion || "-"}</td>
                      <td className="p-2">{r.bo || "-"}</td>
                      <td className="p-2">{r.observacionInconcert || "-"}</td>
                    </tr>
                  ))}
                  {!modal.list.length ? (
                    <tr>
                      <td colSpan={10} className="text-center p-4 text-muted-foreground">Sin llamadas</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
