"use client";

import { useEffect, useMemo, useState } from "react";

type MaterialCatalog = {
  id: string;
  nombre: string;
  unidadTipo: "UND" | "METROS";
};

type MaterialStock = {
  materialId: string;
  stockUnd: number;
  stockMetros: number;
};

type Row = {
  id: string;
  nombre: string;
  estado?: string;
  coordinadorNombre: string;
  equipos: {
    ONT: number;
    MESH: number;
    FONO: number;
    BOX: number;
    ONT_HUAWEI: number;
    ONT_ZTE: number;
    MESH_HUAWEI: number;
    MESH_ZTE: number;
  };
  materiales: {
    materialCount: number;
    totalUnd: number;
    totalMetros: number;
    materiales: MaterialStock[];
  };
  criticos: string[];
};

type ApiData = {
  ok: boolean;
  generatedAt: string;
  canAdjustStock: boolean;
  almacen: {
    ONT: number;
    MESH: number;
    FONO: number;
    BOX: number;
    ONT_HUAWEI: number;
    ONT_ZTE: number;
    MESH_HUAWEI: number;
    MESH_ZTE: number;
  };
  materialesCatalog: MaterialCatalog[];
  rows: Row[];
};

function asLocalDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildOperativeRecommendation(row: Row | null, almacen: ApiData["almacen"] | undefined): string[] {
  if (!row || !almacen) return [];
  const recs: string[] = [];
  const hasOntCritical = row.criticos.includes("SIN_ONT");
  const hasMeshCritical = row.criticos.includes("SIN_MESH");
  const hasEquiposCritical = row.criticos.includes("SIN_EQUIPOS");
  const hasMatCritical = row.criticos.includes("SIN_MATERIALES");

  if (hasEquiposCritical || hasOntCritical) {
    if (almacen.ONT_HUAWEI >= almacen.ONT_ZTE && almacen.ONT_HUAWEI > 0) {
      recs.push(`Priorizar despacho ONT HUAWEI (${almacen.ONT_HUAWEI} disponibles en almacen).`);
    } else if (almacen.ONT_ZTE > 0) {
      recs.push(`Priorizar despacho ONT ZTE (${almacen.ONT_ZTE} disponibles en almacen).`);
    } else {
      recs.push("No hay ONT disponible en almacen; escalar reposicion antes de programar despachos.");
    }
  }

  if (hasEquiposCritical || hasMeshCritical) {
    if (almacen.MESH_HUAWEI >= almacen.MESH_ZTE && almacen.MESH_HUAWEI > 0) {
      recs.push(`Priorizar despacho MESH HUAWEI (${almacen.MESH_HUAWEI} disponibles en almacen).`);
    } else if (almacen.MESH_ZTE > 0) {
      recs.push(`Priorizar despacho MESH ZTE (${almacen.MESH_ZTE} disponibles en almacen).`);
    } else {
      recs.push("No hay MESH disponible en almacen; considerar redistribucion temporal.");
    }
  }

  if (row.equipos.FONO <= 0 && almacen.FONO > 0) {
    recs.push(`Agregar FONO al siguiente despacho (${almacen.FONO} en almacen).`);
  }
  if (row.equipos.BOX <= 0 && almacen.BOX > 0) {
    recs.push(`Agregar BOX al siguiente despacho (${almacen.BOX} en almacen).`);
  }
  if (hasMatCritical) {
    recs.push("Aplicar ajuste manual de materiales para evitar bloqueo operativo de la cuadrilla.");
  }
  if (!recs.length) {
    recs.push("Stock estable: mantener monitoreo y priorizar cuadrillas con mayor criticidad.");
  }
  return recs;
}

export default function AdminInstalacionesClient() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [selectedCuadrilla, setSelectedCuadrilla] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [sortMode, setSortMode] = useState<"CRITICIDAD" | "NOMBRE">("CRITICIDAD");
  const [modalCuadrillaId, setModalCuadrillaId] = useState("");
  const [includeAll, setIncludeAll] = useState(false);

  const load = async (showAll = includeAll) => {
    setError("");
    try {
      const qs = showAll ? "?includeInactive=1" : "";
      const res = await fetch(`/api/admin/instalaciones/stock-overview${qs}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiData | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "ERROR");
      setData(json);
      if (!selectedCuadrilla && json.rows.length) {
        setSelectedCuadrilla(json.rows[0].id);
      } else if (selectedCuadrilla && !json.rows.some((r) => r.id === selectedCuadrilla)) {
        setSelectedCuadrilla(json.rows[0]?.id || "");
      }
    } catch (e: any) {
      setError(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    const timer = window.setInterval(() => {
      if (!alive) return;
      load();
    }, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [includeAll]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const needle = q.trim().toLowerCase();
    const filtered = !needle
      ? rows
      : rows.filter((r) => {
      const hay = `${r.nombre} ${r.coordinadorNombre} ${r.id}`.toLowerCase();
      return hay.includes(needle);
    });
    const score = (r: Row) => {
      let s = r.criticos.length;
      if (r.criticos.includes("SIN_EQUIPOS")) s += 5;
      if (r.criticos.includes("SIN_ONT")) s += 2;
      if (r.criticos.includes("SIN_MESH")) s += 2;
      if (r.criticos.includes("SIN_MATERIALES")) s += 1;
      return s;
    };
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "NOMBRE") return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      const sa = score(a);
      const sb = score(b);
      if (sb !== sa) return sb - sa;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
    return sorted;
  }, [data, q, sortMode]);

  const selectedRow = useMemo(() => (data?.rows || []).find((r) => r.id === selectedCuadrilla) || null, [data, selectedCuadrilla]);
  const selectedMaterial = useMemo(() => (data?.materialesCatalog || []).find((m) => m.id === materialId) || null, [data, materialId]);
  const modalRow = useMemo(() => (data?.rows || []).find((r) => r.id === modalCuadrillaId) || null, [data, modalCuadrillaId]);
  const modalRecommendations = useMemo(
    () => buildOperativeRecommendation(modalRow, data?.almacen),
    [modalRow, data]
  );
  const summary = useMemo(() => {
    const rows = data?.rows || [];
    const criticas = rows.filter((r) => r.criticos.length > 0).length;
    const totalEquipos = rows.reduce((acc, r) => acc + r.equipos.ONT + r.equipos.MESH + r.equipos.FONO + r.equipos.BOX, 0);
    const totalMateriales = rows.reduce((acc, r) => acc + r.materiales.materialCount, 0);
    return {
      cuadrillas: rows.length,
      criticas,
      totalEquipos,
      totalMateriales,
    };
  }, [data]);

  async function onAjustar() {
    if (!data?.canAdjustStock) return;
    if (!selectedCuadrilla || !materialId || !cantidad || !observacion.trim()) {
      setMsg("Completa cuadrilla, material, cantidad y observacion.");
      return;
    }
    const qtyNum = Number(cantidad);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setMsg("Cantidad invalida.");
      return;
    }

    setSaving(true);
    setMsg("");
    try {
      const body: any = {
        cuadrillaId: selectedCuadrilla,
        materialId,
        observacion: observacion.trim(),
      };
      if (selectedMaterial?.unidadTipo === "METROS") body.metros = qtyNum;
      else body.und = Math.floor(qtyNum);

      const res = await fetch("/api/admin/instalaciones/stock-overview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "ERROR");
      setMsg("Ajuste aplicado correctamente.");
      setCantidad("");
      setObservacion("");
      await load();
    } catch (e: any) {
      setMsg(String(e?.message || "ERROR"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-600 dark:text-slate-400">Cargando panel de instalaciones...</div>;

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Centro de Control Instalaciones</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Stock por modelo, cuadrillas criticas y ajuste manual de materiales. Actualizado: {asLocalDateTime(data?.generatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="h-10 rounded-xl border border-slate-300 bg-white/80 px-4 text-sm font-medium hover:bg-white dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            Refrescar
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs uppercase tracking-wide text-slate-500">Cuadrillas</div>
          <div className="mt-1 text-2xl font-semibold">{summary.cuadrillas}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-sm md:col-span-2 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Criticas</div>
          <div className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">{summary.criticas}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs uppercase tracking-wide text-slate-500">Equipos campo</div>
          <div className="mt-1 text-2xl font-semibold">{summary.totalEquipos}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs uppercase tracking-wide text-slate-500">Items materiales</div>
          <div className="mt-1 text-2xl font-semibold">{summary.totalMateriales}</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Pool ONT H/Z</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.ONT_HUAWEI || 0} / {data?.almacen.ONT_ZTE || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Pool MESH H/Z</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.MESH_HUAWEI || 0} / {data?.almacen.MESH_ZTE || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Pool FONO</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.FONO || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Pool BOX</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.BOX || 0}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cuadrilla/coordinador"
            className="h-10 w-full max-w-sm rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => setIncludeAll(e.target.checked)}
            />
            Ver todas (incluye inactivas)
          </label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as "CRITICIDAD" | "NOMBRE")}
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="CRITICIDAD">Orden: criticidad</option>
            <option value="NOMBRE">Orden: nombre</option>
          </select>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-100/80 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left">Cuadrilla</th>
                <th className="px-3 py-2 text-left">Coordinador</th>
                <th className="px-3 py-2 text-left">Equipos</th>
                <th className="px-3 py-2 text-left">Materiales</th>
                <th className="px-3 py-2 text-left">Criticidad</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50/80 dark:border-slate-700 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setSelectedCuadrilla(r.id)} className="text-left font-medium text-slate-800 hover:underline dark:text-slate-100">
                      {r.nombre}
                    </button>
                    {r.estado && ["INACTIVO", "DESHABILITADO", "BAJA"].includes(String(r.estado).toUpperCase()) ? (
                      <div className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {r.estado}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.coordinadorNombre || "-"}</td>
                  <td className="px-3 py-2">
                    ONT {r.equipos.ONT} | MESH {r.equipos.MESH} | FONO {r.equipos.FONO} | BOX {r.equipos.BOX}
                  </td>
                  <td className="px-3 py-2">
                    {r.materiales.materialCount} items | UND {r.materiales.totalUnd} | M {r.materiales.totalMetros}
                  </td>
                  <td className="px-3 py-2">
                    {r.criticos.length ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {r.criticos.join(", ")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCuadrilla(r.id);
                        setModalCuadrillaId(r.id);
                        setMsg("");
                      }}
                      className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No hay cuadrillas para los filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {modalRow ? (
        <div className="fixed inset-0 z-[180] bg-black/45 p-4" onClick={() => setModalCuadrillaId("")}>
          <div
            className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xl font-semibold">{modalRow.nombre}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Coordinador: {modalRow.coordinadorNombre || "-"}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalCuadrillaId("")}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-500">ONT H/Z</div>
                <div className="mt-1 text-lg font-semibold">{modalRow.equipos.ONT_HUAWEI} / {modalRow.equipos.ONT_ZTE}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-500">MESH H/Z</div>
                <div className="mt-1 text-lg font-semibold">{modalRow.equipos.MESH_HUAWEI} / {modalRow.equipos.MESH_ZTE}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-500">FONO</div>
                <div className="mt-1 text-lg font-semibold">{modalRow.equipos.FONO}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-500">BOX</div>
                <div className="mt-1 text-lg font-semibold">{modalRow.equipos.BOX}</div>
              </div>
            </div>

            <div className="mt-3">
              {modalRow.criticos.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  Equipos/stock critico: {modalRow.criticos.join(", ")}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Estado operativo OK: sin criticidades actuales.
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-800 dark:bg-cyan-900/20">
              <h4 className="text-sm font-semibold text-cyan-900 dark:text-cyan-200">Recomendacion operativa</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cyan-900 dark:text-cyan-100">
                {modalRecommendations.map((r, idx) => (
                  <li key={`${idx}_${r}`}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stock de materiales</h4>
                <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-3 py-2 text-left">UND</th>
                        <th className="px-3 py-2 text-left">Metros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modalRow.materiales.materiales || []).map((m) => {
                        const cat = (data?.materialesCatalog || []).find((x) => x.id === m.materialId);
                        return (
                          <tr key={m.materialId} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-3 py-2">{cat?.nombre || m.materialId}</td>
                            <td className="px-3 py-2">{m.stockUnd}</td>
                            <td className="px-3 py-2">{m.stockMetros}</td>
                          </tr>
                        );
                      })}
                      {!modalRow.materiales.materiales?.length ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                            Sin materiales cargados para esta cuadrilla.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Agregar stock manual</h4>
                {!data?.canAdjustStock ? (
                  <p className="mt-3 text-sm text-rose-600">No tienes permiso para ajustar stock.</p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <select
                      value={materialId}
                      onChange={(e) => setMaterialId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Selecciona material</option>
                      {(data?.materialesCatalog || []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre} ({m.unidadTipo})
                        </option>
                      ))}
                    </select>
                    <input
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      placeholder={selectedMaterial?.unidadTipo === "METROS" ? "Metros a sumar" : "Unidades a sumar"}
                      type="number"
                      min="0"
                      step={selectedMaterial?.unidadTipo === "METROS" ? "0.01" : "1"}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <textarea
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      placeholder="Motivo del ajuste"
                      className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={onAjustar}
                      disabled={saving}
                      className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                    >
                      {saving ? "Aplicando..." : "Aplicar ajuste"}
                    </button>
                    {msg ? <p className="text-sm text-slate-700 dark:text-slate-300">{msg}</p> : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
