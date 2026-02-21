"use client";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useAccess } from "@/lib/useAccess";

type EstadoAsistencia =
  | "asistencia"
  | "falta"
  | "suspendida"
  | "descanso"
  | "descanso medico"
  | "vacaciones"
  | "recuperacion"
  | "asistencia compensada";

type CuadrillaRow = {
  id?: string;
  fecha: string;
  cuadrillaId: string;
  cuadrillaNombre?: string;
  zonaId?: string;
  zonaNombre?: string;
  estadoAsistencia?: string;
  observacion?: string;
  gestorUid?: string;
  gestorNombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type TecnicoRow = {
  id?: string;
  fecha: string;
  tecnicoId: string;
  tecnicoNombre?: string;
  cuadrillaId?: string;
  cuadrillaNombre?: string;
  zonaId?: string;
  zonaNombre?: string;
  estadoAsistencia?: string;
  gestorUid?: string;
  gestorNombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type EditPatch = { estadoAsistencia?: string; observacion?: string };
type EditMap = Record<string, EditPatch>;
type ResumenApi = { ok?: boolean; error?: string; cuadrillas?: CuadrillaRow[]; tecnicos?: TecnicoRow[] };

const cls = (...x: Array<string | false | null | undefined>) => x.filter(Boolean).join(" ");

const estadoToColor = (estado: string) => {
  switch (String(estado || "").toLowerCase()) {
    case "asistencia":
      return "bg-green-50 text-green-700 ring-green-200";
    case "falta":
      return "bg-red-50 text-red-700 ring-red-200";
    case "suspendida":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "descanso":
      return "bg-yellow-50 text-yellow-700 ring-yellow-200";
    case "descanso medico":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "vacaciones":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "recuperacion":
      return "bg-gray-50 text-gray-700 ring-gray-200";
    case "asistencia compensada":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
};

const EstadoPill = ({ estado }: { estado?: string }) => (
  <span className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", estadoToColor(estado || ""))}>
    {estado || "-"}
  </span>
);

const Progress = ({ value = 0 }) => (
  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
    <div className="h-2 bg-[#30518c] transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export default function AsistenciaResumenClient() {
  const { roles: accessRoles, isAdmin } = useAccess();

  const hoy = dayjs().format("YYYY-MM-DD");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [tab, setTab] = useState("cuadrillas");

  const [filtroGestor, setFiltroGestor] = useState("");
  const [filtroCoordinador, setFiltroCoordinador] = useState("");
  const [filtroCuadrilla, setFiltroCuadrilla] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [cuadrillas, setCuadrillas] = useState<CuadrillaRow[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoRow[]>([]);
  const [editando, setEditando] = useState<EditMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normRole = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  const roles = (accessRoles || []).map((r: string) => normRole(String(r)));
  const puedeEditar = isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

  const fetchResumen = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("desde", desde);
      qs.set("hasta", hasta);
      const res = await fetch(`/api/asistencia/resumen?${qs.toString()}`, { cache: "no-store" });
      const json: ResumenApi = await res.json();
      if (!json?.ok) throw new Error(json?.error || "ERROR");
      setCuadrillas(json.cuadrillas || []);
      setTecnicos(json.tecnicos || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar";
      setError(msg);
      setCuadrillas([]);
      setTecnicos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const gestoresUnicos = useMemo(() => {
    const set = new Set<string>();
    cuadrillas.forEach((c) => {
      const v = c.gestorNombre || c.gestorUid || "";
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cuadrillas]);

  const coordinadoresUnicos = useMemo(() => {
    const set = new Set<string>();
    cuadrillas.forEach((c) => {
      const v = c.coordinadorNombre || c.coordinadorUid || "";
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cuadrillas]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = (filtroCuadrilla || "").toLowerCase().trim();
    return cuadrillas.filter((c) => {
      const gestor = c.gestorNombre || c.gestorUid || "";
      const coord = c.coordinadorNombre || c.coordinadorUid || "";
      const estado = String(c.estadoAsistencia || "").toLowerCase();
      const texto = [c.cuadrillaNombre, c.zonaNombre, gestor, coord].filter(Boolean).join(" ").toLowerCase();
      return (
        (!filtroGestor || gestor === filtroGestor) &&
        (!filtroCoordinador || coord === filtroCoordinador) &&
        (!filtroEstado || estado === filtroEstado) &&
        (!q || texto.includes(q))
      );
    });
  }, [cuadrillas, filtroGestor, filtroCoordinador, filtroEstado, filtroCuadrilla]);

  const tecnicosFiltrados = useMemo(() => {
    const q = (filtroTecnico || "").toLowerCase().trim();
    return tecnicos.filter((t) => {
      const estado = String(t.estadoAsistencia || "").toLowerCase();
      const nombre = (t.tecnicoNombre || t.tecnicoId || "").toLowerCase();
      return (!filtroEstado || estado === filtroEstado) && (!q || nombre.includes(q));
    });
  }, [tecnicos, filtroEstado, filtroTecnico]);

  const resumen = useMemo(() => {
    const contar = (arr: Array<CuadrillaRow | TecnicoRow>, valor: EstadoAsistencia) =>
      arr.reduce((acc, x) => acc + (String(x.estadoAsistencia || "").toLowerCase() === valor ? 1 : 0), 0);
    const cTotal = cuadrillasFiltradas.length;
    const tTotal = tecnicosFiltrados.length;
    const cAsis = contar(cuadrillasFiltradas, "asistencia");
    const tAsis = contar(tecnicosFiltrados, "asistencia");
    const cFalta = contar(cuadrillasFiltradas, "falta");
    const tFalta = contar(tecnicosFiltrados, "falta");
    const cPct = cTotal ? ((cAsis / cTotal) * 100).toFixed(1) : "0.0";
    const tPct = tTotal ? ((tAsis / tTotal) * 100).toFixed(1) : "0.0";
    return { cAsis, cFalta, cTotal, cPct, tAsis, tFalta, tTotal, tPct };
  }, [cuadrillasFiltradas, tecnicosFiltrados]);

  const exportarExcel = () => {
    const cuadrillasSheet = cuadrillasFiltradas.map((c) => ({
      Fecha: c.fecha,
      Cuadrilla: c.cuadrillaNombre || c.cuadrillaId || "",
      Zona: c.zonaNombre || c.zonaId || "",
      Estado: c.estadoAsistencia || "",
      Observacion: c.observacion || "",
      Gestor: c.gestorNombre || c.gestorUid || "",
      Coordinador: c.coordinadorNombre || c.coordinadorUid || "",
    }));
    const tecnicosSheet = tecnicosFiltrados.map((t) => ({
      Fecha: t.fecha,
      Tecnico: t.tecnicoNombre || t.tecnicoId || "",
      Cuadrilla: t.cuadrillaNombre || t.cuadrillaId || "",
      Estado: t.estadoAsistencia || "",
      Gestor: t.gestorNombre || t.gestorUid || "",
      Coordinador: t.coordinadorNombre || t.coordinadorUid || "",
      Zona: t.zonaNombre || t.zonaId || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cuadrillasSheet), "Cuadrillas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tecnicosSheet), "Tecnicos");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([out], { type: "application/octet-stream" }), `asistencia_${desde}_a_${hasta}.xlsx`);
  };

  const handleEditChange = (id: string, field: keyof EditPatch, value: string) => {
    setEditando((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const cancelarEdicion = (id: string) => {
    setEditando((prev) => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  };

  const guardarCambios = async (c: CuadrillaRow) => {
    const id = c.id || `${c.fecha}_${c.cuadrillaId}`;
    const patch = editando[id];
    if (!patch) return;
    const payload = {
      target: "cuadrillas",
      fecha: c.fecha,
      cuadrillaId: c.cuadrillaId,
      patch: { estadoAsistencia: patch.estadoAsistencia, observacion: patch.observacion },
    };
    const res = await fetch("/api/asistencia/resumen/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json?.ok) return toast.error(json?.error || "No se pudo guardar");
    setCuadrillas((prev) =>
      prev.map((x) => ((x.id || `${x.fecha}_${x.cuadrillaId}`) === id ? { ...x, ...patch } : x))
    );
    toast.success("Cambios guardados");
    cancelarEdicion(id);
  };

  const guardarCambiosTecnico = async (t: TecnicoRow) => {
    const id = t.id || `${t.fecha}_${t.tecnicoId}`;
    const patch = editando[id];
    if (!patch) return;
    const payload = { target: "tecnicos", fecha: t.fecha, tecnicoId: t.tecnicoId, patch: { estadoAsistencia: patch.estadoAsistencia } };
    const res = await fetch("/api/asistencia/resumen/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json?.ok) return toast.error(json?.error || "No se pudo guardar");
    setTecnicos((prev) =>
      prev.map((x) => ((x.id || `${x.fecha}_${x.tecnicoId}`) === id ? { ...x, ...patch } : x))
    );
    toast.success("Cambios guardados");
    cancelarEdicion(id);
  };

  return (
    <div className="h-full w-full overflow-auto">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-full px-4 py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-2xl font-bold text-[#30518c]">Asistencia - Visualizar y Editar</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
              <div className="p-3 rounded-xl border bg-white">
                <div className="text-xs text-gray-500">Cuadrillas asist.</div>
                <div className="font-bold text-lg">{resumen.cAsis}/{resumen.cTotal}</div>
                <Progress value={Number(resumen.cPct)} />
              </div>
              <div className="p-3 rounded-xl border bg-white">
                <div className="text-xs text-gray-500">Tecnicos asist.</div>
                <div className="font-bold text-lg">{resumen.tAsis}/{resumen.tTotal}</div>
                <Progress value={Number(resumen.tPct)} />
              </div>
              <div className="p-3 rounded-xl border bg-white">
                <div className="text-xs text-gray-500">Cuadrillas falta</div>
                <div className="font-bold text-lg">{resumen.cFalta}</div>
              </div>
              <div className="p-3 rounded-xl border bg-white">
                <div className="text-xs text-gray-500">Tecnicos falta</div>
                <div className="font-bold text-lg">{resumen.tFalta}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold">Desde:</label>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-3 py-2 border rounded-md" />
                <label className="text-sm font-semibold">Hasta:</label>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="px-3 py-2 border rounded-md" />
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={filtroGestor} onChange={(e) => setFiltroGestor(e.target.value)} className="px-3 py-2 border rounded-md">
                  <option value="">Todos los Gestores</option>
                  {gestoresUnicos.map((g) => (<option key={g} value={g}>{g}</option>))}
                </select>
                <select value={filtroCoordinador} onChange={(e) => setFiltroCoordinador(e.target.value)} className="px-3 py-2 border rounded-md">
                  <option value="">Todos los Coordinadores</option>
                  {coordinadoresUnicos.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                <input type="text" placeholder="Buscar cuadrilla / zona / gestor..." value={filtroCuadrilla} onChange={(e) => setFiltroCuadrilla(e.target.value)} className="px-3 py-2 border rounded-md" />
                <input type="text" placeholder="Buscar tecnico..." value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} className="px-3 py-2 border rounded-md" />
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => { setFiltroGestor(""); setFiltroCoordinador(""); setFiltroCuadrilla(""); setFiltroTecnico(""); setFiltroEstado(""); }} className="px-3 py-2 rounded-md border hover:bg-gray-50">Limpiar</button>
                <button onClick={exportarExcel} className="bg-[#30518c] text-white px-4 py-2 rounded shadow hover:bg-[#203a66]">Excel</button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Filtrar estado:</span>
              {["", "asistencia", "falta", "suspendida", "descanso", "descanso medico", "vacaciones", "recuperacion", "asistencia compensada"].map((e) => (
                <span
                  key={e || "todos"}
                  onClick={() => setFiltroEstado((prev) => (prev === e ? "" : e))}
                  className={cls(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset cursor-pointer",
                    e ? estadoToColor(e) : "bg-slate-50 text-slate-700 ring-slate-200",
                    filtroEstado === e ? "outline outline-2 outline-offset-2 outline-[#30518c]" : ""
                  )}
                >
                  {e || "Todos"}
                </span>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setTab("cuadrillas")} className={cls("px-3 py-1.5 rounded-full text-sm ring-1", tab === "cuadrillas" ? "bg-[#30518c] text-white ring-[#30518c]" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50")}>Cuadrillas</button>
                <button onClick={() => setTab("tecnicos")} className={cls("px-3 py-1.5 rounded-full text-sm ring-1", tab === "tecnicos" ? "bg-[#30518c] text-white ring-[#30518c]" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50")}>Tecnicos</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {loading ? (
          <div className="p-8 text-gray-500">Cargando...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600">{error}</div>
        ) : tab === "cuadrillas" ? (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-auto">
            {cuadrillasFiltradas.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay registros para los filtros seleccionados.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#30518c] text-white text-left sticky top-0 z-10">
                    <th className="p-2">Cuadrilla</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Zona</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Observacion</th>
                    <th className="p-2">Gestor</th>
                    <th className="p-2">Coordinador</th>
                    <th className="p-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {cuadrillasFiltradas.map((c, idx) => {
                    const rowId = c.id || `${c.fecha}_${c.cuadrillaId}`;
                    const esEditando = !!editando[rowId];
                    const valor = editando[rowId] || c;
                    return (
                      <tr key={rowId} className={cls("border-b", idx % 2 ? "bg-gray-50/50" : "", "hover:bg-gray-50")}>
                        <td className="p-2">{c.cuadrillaNombre || c.cuadrillaId}</td>
                        <td className="p-2">{c.fecha}</td>
                        <td className="p-2">{c.zonaNombre || c.zonaId || "-"}</td>
                        <td className="p-2">
                          {esEditando ? (
                            <select value={valor.estadoAsistencia} onChange={(e) => handleEditChange(rowId, "estadoAsistencia", e.target.value)} className="border px-2 py-1 rounded-md">
                              {["asistencia","falta","suspendida","descanso","descanso medico","vacaciones","recuperacion","asistencia compensada"].map((op) => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                          ) : (
                            <EstadoPill estado={c.estadoAsistencia} />
                          )}
                        </td>
                        <td className="p-2">
                          {esEditando ? (
                            <input value={valor.observacion || ""} onChange={(e) => handleEditChange(rowId, "observacion", e.target.value)} className="border px-2 py-1 rounded-md" />
                          ) : (
                            c.observacion || <span className="text-gray-400 italic">Sin observacion</span>
                          )}
                        </td>
                        <td className="p-2">{c.gestorNombre || c.gestorUid || "-"}</td>
                        <td className="p-2">{c.coordinadorNombre || c.coordinadorUid || "-"}</td>
                        <td className="p-2">
                          {puedeEditar ? (
                            esEditando ? (
                              <div className="flex gap-2">
                                <button onClick={() => guardarCambios(c)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">Guardar</button>
                                <button onClick={() => cancelarEdicion(rowId)} className="border px-3 py-1 rounded hover:bg-gray-50">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditando((p) => ({ ...p, [rowId]: c }))} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded">Editar</button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">Sin permisos</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-auto">
            {tecnicosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay registros para los filtros seleccionados.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#30518c] text-white text-left sticky top-0 z-10">
                    <th className="p-2">Tecnico</th>
                    <th className="p-2">Cuadrilla</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {tecnicosFiltrados.map((t, idx) => {
                    const rowId = t.id || `${t.fecha}_${t.tecnicoId}`;
                    const esEditando = !!editando[rowId];
                    const valor = editando[rowId] || t;
                    return (
                      <tr key={rowId} className={cls("border-b", idx % 2 ? "bg-gray-50/50" : "", "hover:bg-gray-50")}>
                        <td className="p-2">{t.tecnicoNombre || t.tecnicoId}</td>
                        <td className="p-2">{t.cuadrillaNombre || t.cuadrillaId || "-"}</td>
                        <td className="p-2">{t.fecha}</td>
                        <td className="p-2">
                          {esEditando ? (
                            <select value={valor.estadoAsistencia} onChange={(e) => handleEditChange(rowId, "estadoAsistencia", e.target.value)} className="border px-2 py-1 rounded-md">
                              {["asistencia","falta","suspendida","descanso","descanso medico","vacaciones","recuperacion","asistencia compensada"].map((op) => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                          ) : (
                            <EstadoPill estado={t.estadoAsistencia} />
                          )}
                        </td>
                        <td className="p-2">
                          {puedeEditar ? (
                            esEditando ? (
                              <div className="flex gap-2">
                                <button onClick={() => guardarCambiosTecnico(t)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">Guardar</button>
                                <button onClick={() => cancelarEdicion(rowId)} className="border px-3 py-1 rounded hover:bg-gray-50">Cancelar</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditando((prev) => ({ ...prev, [rowId]: t }))} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded">Editar</button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">Sin permisos</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


