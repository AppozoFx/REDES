"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const TIPOS = ["ONT", "MESH", "FONO", "BOX"] as const;

type TipoEquipo = (typeof TIPOS)[number];

type Equipo = Record<string, any>;
type Cuadrilla = Record<string, any>;
type Usuario = Record<string, any>;

function isUid(v: any) {
  return typeof v === "string" && v.length >= 10 && !v.includes(" ");
}

function shortName(full: string, fallback = "") {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  // Heuristica para texto completo:
  // - 4+ partes: Nombre1 Nombre2 Apellido1 Apellido2 -> tomar parte 3
  // - 2-3 partes: tomar parte 2 como primer apellido probable
  const firstLast = parts.length >= 4 ? parts[2] : parts.length >= 2 ? parts[1] : "";
  const v = `${first} ${firstLast}`.trim();
  return v || fallback;
}

function toDateStr(v: any) {
  if (!v) return "";
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("es-PE");
    return v;
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v?.toDate === "function") return v.toDate().toLocaleDateString("es-PE");
  return "";
}

function resolveName(idOrName: any, usersIdx: Map<string, string>) {
  if (!idOrName) return "";
  if (typeof idOrName === "object") {
    const cand = idOrName?.id || idOrName?.uid || idOrName?.userId || idOrName?.value;
    if (!cand) return "";
    const fromIdx = usersIdx.get(cand);
    if (fromIdx) return fromIdx;
    const names = `${String(idOrName?.nombres || idOrName?.nombre || "").trim()} ${String(idOrName?.apellidos || "").trim()}`.trim();
    if (names) return shortName(names, String(cand));
    return shortName(String(cand), String(cand));
  }
  if (isUid(idOrName)) return usersIdx.get(idOrName) || String(idOrName);
  return shortName(String(idOrName), String(idOrName));
}

function pickAnyField(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== "") return obj[k];
  }
}

function pickAnyNested(obj: any, paths: string[]) {
  for (const p of paths) {
    const keys = p.split(".");
    let cur: any = obj;
    for (const k of keys) {
      if (cur == null) {
        cur = undefined;
        break;
      }
      cur = cur[k];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
}

function extractGuiaId(v: any) {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    const cand = v.id || v.guiaId || v.numero || v.codigo || v.value;
    return typeof cand === "string" ? cand.trim() : "";
  }
  return "";
}

function isExcludedUbicacion(v: any) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ["robo", "perdida", "averia", "garantia"].some((w) => s.includes(w));
}

function toLabelTipo(rc: string) {
  if (!rc) return "";
  if (rc.includes("resi")) return "RESIDENCIAL";
  if (rc.includes("condo")) return "CONDOMINIO";
  return rc.toUpperCase();
}

function normalizeTipoCuadrilla(v: any) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return "";
  if (s.includes("resi")) return "residencial";
  if (s.includes("condo")) return "condominio";
  return s;
}

function tecnicoDeEquipo(eq: any, meta: any, usersIdx: Map<string, string>) {
  if (Array.isArray(eq?.tecnicos) && eq.tecnicos.length) {
    const lista = eq.tecnicos
      .map((t: any) => resolveName(t, usersIdx))
      .map((t: string) => t.trim())
      .filter(Boolean);
    const unicos = Array.from(new Set(lista));
    if (unicos.length) return unicos.join(", ");
  }
  const cand = pickAnyField(eq, [
    "tecnicoNombre",
    "tecnico_name",
    "tecnico",
    "tecnico1",
    "tecnico_uid",
    "tecnicoUid",
    "tecnicoId",
    "tecnico_id",
    "asignadoA",
    "asignado_a",
    "asignado",
    "responsable",
    "user",
    "userId",
    "user_uid",
  ]);
  const resolved = resolveName(cand, usersIdx);
  if (resolved) return resolved.trim();

  const listaMeta = [
    ...(Array.isArray(meta?.tecnicos) ? meta.tecnicos : []),
    ...(Array.isArray(meta?.tecnicosIds) ? meta.tecnicosIds : []),
  ]
    .map((t: any) => resolveName(t, usersIdx))
    .map((t: string) => t.trim())
    .filter(Boolean);
  const unicosMeta = Array.from(new Set(listaMeta));
  return unicosMeta.length === 1 ? unicosMeta[0] : "";
}

export default function StockEquiposClient() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerScope, setViewerScope] = useState<"all" | "coordinador" | "tecnico">("all");

  const [busqueda, setBusqueda] = useState("");
  const [tipoCuadrilla, setTipoCuadrilla] = useState("todas");
  const [coordinadorFiltro, setCoordinadorFiltro] = useState("todos");
  const [soloConStock, setSoloConStock] = useState(true);
  const [equipoFiltro, setEquipoFiltro] = useState("todos");
  const [descripcionOpen, setDescripcionOpen] = useState(false);
  const [descripcionQuery, setDescripcionQuery] = useState("");
  const [descripcionesSeleccionadas, setDescripcionesSeleccionadas] = useState<Set<string>>(new Set());
  const [seleccionDetalle, setSeleccionDetalle] = useState<string | null>(null);
  const [busquedaSerie, setBusquedaSerie] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/equipos/dashboard-stock", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        setEquipos(Array.isArray(body.equipos) ? body.equipos : []);
        setCuadrillas(Array.isArray(body.cuadrillas) ? body.cuadrillas : []);
        setUsuarios(Array.isArray(body.usuarios) ? body.usuarios : []);
        setViewerScope(
          body?.meta?.viewerScope === "coordinador" || body?.meta?.viewerScope === "tecnico"
            ? body.meta.viewerScope
            : "all"
        );
        if (body?.meta?.truncated) {
          toast.message("Se alcanzo el limite de lectura de equipos para el dashboard.");
        }
      } catch (e: any) {
        toast.error(e?.message || "No se pudo cargar dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const usuariosIdx = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) {
      const id = String(u.uid || u.id || "");
      const nombres = String(u.nombres || u.nombre || "").trim();
      const apellidos = String(u.apellidos || "").trim();
      const n1 = nombres.split(/\s+/).filter(Boolean)[0] || "";
      const a1 = apellidos.split(/\s+/).filter(Boolean)[0] || "";
      const exact = `${n1} ${a1}`.trim();
      if (id) m.set(id, exact || shortName(`${nombres} ${apellidos}`.trim(), id));
    }
    return m;
  }, [usuarios]);

  const metaPorCuadrillaKey = useMemo(() => {
    const m = new Map<string, any>();
    const key = (v: any) => String(v || "").trim().toUpperCase();
    for (const c of cuadrillas) {
      const nombre = String(c.nombre || "").trim();
      const id = String(c.id || "").trim();
      const numero = String(c.numeroCuadrilla || "").trim();
      if (!nombre && !id) continue;
      const meta = {
        r_c: normalizeTipoCuadrilla(c.r_c || c.tipo || c.tipo_cuadrilla || c.categoria),
        tecnicos: Array.isArray(c.tecnicos) ? c.tecnicos : [],
        tecnicosIds: Array.isArray(c.tecnicosIds) ? c.tecnicosIds : Array.isArray(c.tecnicosUids) ? c.tecnicosUids : [],
        gestor:
          pickAnyField(c, [
            "gestorUid",
            "gestorId",
            "gestor",
            "gestorNombre",
            "gestoraUid",
            "gestoraId",
            "gestora",
            "gestoraNombre",
            "usuarioGestor",
            "responsable",
            "supervisor",
          ]) ||
          pickAnyNested(c, ["gestor.uid", "gestor.id", "gestor.nombre", "gestora.uid", "gestora.id", "gestora.nombre"]) ||
          "",
        coordinador:
          pickAnyField(c, [
            "coordinadorUid",
            "coordinadorId",
            "coordinador",
            "coordinadorNombre",
            "coordinadoraUid",
            "coordinadoraId",
            "coordinadora",
            "coordinadoraNombre",
            "lider",
          ]) || "",
      };
      if (nombre) m.set(key(nombre), meta);
      if (id) m.set(key(id), meta);
      if (numero) m.set(key(numero), meta);
    }
    return m;
  }, [cuadrillas]);

  const coordinadoresOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cuadrillas) {
      const nom = resolveName(c.coordinadorUid || c.coordinador || c.coordinadorNombre, usuariosIdx).trim();
      if (nom) set.add(nom);
    }
    return ["todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [cuadrillas, usuariosIdx]);

  const tipoCuadrillaDeEquipo = (eq: any) => {
    const key = String(eq?.ubicacion || "").trim().toUpperCase();
    if (!key) return "";
    const meta = metaPorCuadrillaKey.get(key);
    return String(meta?.r_c || "");
  };

  const pasaFiltroTipoCuadrilla = (eq: any) => {
    if (tipoCuadrilla === "todas") return true;
    return tipoCuadrillaDeEquipo(eq) === tipoCuadrilla;
  };

  const descripcionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const eq of equipos) {
      if (String(eq.estado || "").toUpperCase() !== "CAMPO") continue;
      if (!pasaFiltroTipoCuadrilla(eq)) continue;
      const d = String(eq.descripcion || "").trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [equipos, tipoCuadrilla, metaPorCuadrillaKey]);

  useEffect(() => {
    setDescripcionesSeleccionadas((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const d of prev) {
        if (descripcionOptions.includes(d)) next.add(d);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [descripcionOptions]);

  const descripcionOptionsFiltradas = useMemo(() => {
    const q = descripcionQuery.trim().toLowerCase();
    if (!q) return descripcionOptions.slice(0, 300);
    return descripcionOptions.filter((d) => d.toLowerCase().includes(q)).slice(0, 300);
  }, [descripcionOptions, descripcionQuery]);

  const kpiAlmacen = useMemo(
    () =>
      TIPOS.map((tipo) => ({
        tipo,
        cantidad: equipos.filter(
          (eq) =>
            String(eq.estado || "").toUpperCase() === "ALMACEN" &&
            String(eq.equipo || "").toUpperCase() === tipo &&
            !isExcludedUbicacion(eq.ubicacion)
        ).length,
      })),
    [equipos]
  );

  const kpiCampo = useMemo(
    () =>
      TIPOS.map((tipo) => ({
        tipo,
        cantidad: equipos.filter(
          (eq) =>
            String(eq.estado || "").toUpperCase() === "CAMPO" &&
            String(eq.equipo || "").toUpperCase() === tipo
        ).length,
      })),
    [equipos]
  );

  const resumenCampoPorCuadrilla = useMemo(() => {
    const acc = new Map<string, any>();
    for (const eq of equipos) {
      if (String(eq.estado || "").toUpperCase() !== "CAMPO") continue;
      if (!pasaFiltroTipoCuadrilla(eq)) continue;
      if (descripcionesSeleccionadas.size > 0) {
        const desc = String(eq.descripcion || "").trim();
        if (!descripcionesSeleccionadas.has(desc)) continue;
      }
      const key = String(eq.ubicacion || "").trim();
      if (!key) continue;
      if (!acc.has(key)) acc.set(key, { nombre: key, ONT: 0, MESH: 0, FONO: 0, BOX: 0, total: 0, r_c: "", coordinadorName: "" });
      const row = acc.get(key);
      const tipoEq = String(eq.equipo || "").toUpperCase();
      if (TIPOS.includes(tipoEq as TipoEquipo)) {
        row[tipoEq]++;
        row.total++;
      }
    }

    for (const row of acc.values()) {
      const meta = metaPorCuadrillaKey.get(String(row.nombre || "").trim().toUpperCase());
      row.r_c = meta?.r_c || "";
      row.coordinadorName = resolveName(meta?.coordinador, usuariosIdx) || "";
      row.tipoLabel = toLabelTipo(row.r_c);
    }

    let data = Array.from(acc.values());
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      data = data.filter((d) => String(d.nombre || "").toLowerCase().includes(q));
    }
    if (tipoCuadrilla !== "todas") data = data.filter((d) => String(d.r_c || "") === tipoCuadrilla);
    if (coordinadorFiltro !== "todos") data = data.filter((d) => d.coordinadorName === coordinadorFiltro);
    if (equipoFiltro !== "todos") {
      data = data
        .map((d) => ({ ...d, totalTipo: Number(d[equipoFiltro] || 0) }))
        .filter((d) => (soloConStock ? d.totalTipo > 0 : true))
        .sort((a, b) => b.totalTipo - a.totalTipo || String(a.nombre).localeCompare(String(b.nombre)));
    } else {
      if (soloConStock) data = data.filter((d) => d.total > 0);
      data.sort((a, b) => b.total - a.total || String(a.nombre).localeCompare(String(b.nombre)));
    }
    return data;
  }, [equipos, metaPorCuadrillaKey, busqueda, tipoCuadrilla, coordinadorFiltro, soloConStock, equipoFiltro, descripcionesSeleccionadas, usuariosIdx]);

  const detalleSeleccion = useMemo(() => {
    if (!seleccionDetalle) return { rows: [], tecnicos: [], gestor: "", coordinador: "" };
    const meta = metaPorCuadrillaKey.get(String(seleccionDetalle || "").trim().toUpperCase()) || {};
    const tecnicosCab = [
      ...(Array.isArray(meta.tecnicos) ? meta.tecnicos : []),
      ...(Array.isArray(meta.tecnicosIds) ? meta.tecnicosIds : []),
    ]
      .map((t: any) => resolveName(t, usuariosIdx))
      .map((t: string) => t.trim())
      .filter(Boolean);
    const tecnicosUnicos = Array.from(new Set(tecnicosCab));
    const gestor = resolveName(meta.gestor, usuariosIdx).trim();
    const coordinador = resolveName(meta.coordinador, usuariosIdx).trim();

    const rows = equipos
      .filter(
        (eq) =>
          String(eq.estado || "").toUpperCase() === "CAMPO" &&
          String(eq.ubicacion || "") === seleccionDetalle &&
          pasaFiltroTipoCuadrilla(eq) &&
          (descripcionesSeleccionadas.size === 0 ||
            descripcionesSeleccionadas.has(String(eq.descripcion || "").trim()))
      )
      .map((eq) => {
        const guia = extractGuiaId(eq.guia_despacho) || extractGuiaId(eq.guiaDespacho) || extractGuiaId(eq.guia);
        return {
          id: eq.id,
          SN: eq.SN || eq.id || "",
          equipo: String(eq.equipo || "").toUpperCase(),
          fechaDespacho: toDateStr(eq.f_despacho || eq.f_despachoYmd),
          guiaDespacho: guia,
          tecnico: tecnicoDeEquipo(eq, meta, usuariosIdx),
          descripcion: String(eq.descripcion || ""),
        };
      })
      .sort((a, b) => a.equipo.localeCompare(b.equipo) || a.SN.localeCompare(b.SN));

    return { rows, tecnicos: tecnicosUnicos, gestor, coordinador };
  }, [seleccionDetalle, equipos, metaPorCuadrillaKey, descripcionesSeleccionadas, usuariosIdx, tipoCuadrilla]);

  const seriesAlmacen = useMemo(() => {
    const totales: Record<TipoEquipo, number> = { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
    const q = busquedaSerie.trim().toLowerCase();
    const rows: any[] = [];

    for (const eq of equipos) {
      if (String(eq.estado || "").toUpperCase() !== "ALMACEN") continue;
      if (isExcludedUbicacion(eq.ubicacion)) continue;
      const tipoEq = String(eq.equipo || "").toUpperCase();
      if (equipoFiltro !== "todos" && tipoEq !== equipoFiltro) continue;
      if (descripcionesSeleccionadas.size > 0 && !descripcionesSeleccionadas.has(String(eq.descripcion || "").trim())) {
        continue;
      }

      if (q) {
        const sn = String(eq.SN || "").toLowerCase();
        const des = String(eq.descripcion || "").toLowerCase();
        const guia = String(eq.guia_ingreso || eq.guiaIngreso || eq.guia?.numero || "").toLowerCase();
        if (!sn.includes(q) && !des.includes(q) && !guia.includes(q)) continue;
      }

      if (TIPOS.includes(tipoEq as TipoEquipo)) totales[tipoEq as TipoEquipo]++;

      rows.push({
        id: eq.id,
        SN: eq.SN || eq.id || "",
        equipo: tipoEq,
        descripcion: String(eq.descripcion || ""),
        fechaIngreso: toDateStr(eq.f_ingreso || eq.f_ingresoYmd),
        guiaIngreso: String(eq.guia_ingreso || eq.guiaIngreso || eq.guia?.numero || ""),
      });
    }

    rows.sort((a, b) => a.equipo.localeCompare(b.equipo) || a.SN.localeCompare(b.SN));
    return { rows, totales, total: rows.length };
  }, [equipos, equipoFiltro, busquedaSerie, descripcionesSeleccionadas]);

  const abrirGuiaDespacho = async (guiaId: string) => {
    const guia = String(guiaId || "").trim();
    if (!guia) return;
    try {
      const res = await fetch(
        `/api/transferencias/instalaciones/guia/url?guiaId=${encodeURIComponent(guia)}&tipo=despacho`,
        { cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body?.url) throw new Error(String(body?.error || "NO_URL"));
      const w = window.open(String(body.url), "_blank");
      if (w) w.opener = null;
    } catch {
      toast.error("No se encontro PDF para esa guia");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="mb-2 text-sm font-semibold">Filtros de Analisis</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cuadrilla"
            className="ui-input-inline lg:col-span-1"
          />
          <select value={equipoFiltro} onChange={(e) => setEquipoFiltro(e.target.value)} className="ui-select-inline ui-select-inline lg:col-span-1">
            <option value="todos">Todos los equipos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="relative lg:col-span-2">
            <button
              type="button"
              onClick={() => setDescripcionOpen((v) => !v)}
              className="w-full rounded border px-3 py-2 text-left text-sm md:min-w-[240px]"
            >
              {descripcionesSeleccionadas.size > 0
                ? `Descripciones: ${descripcionesSeleccionadas.size}`
                : "Filtrar por descripciones"}
            </button>
            {descripcionOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,420px)] rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-2 shadow-xl">
                <input
                  value={descripcionQuery}
                  onChange={(e) => setDescripcionQuery(e.target.value)}
                  placeholder="Buscar descripcion..."
                  className="mb-2 w-full rounded border px-2 py-1 text-xs"
                />
                <div className="max-h-52 overflow-auto">
                  {descripcionOptionsFiltradas.map((d) => (
                    <label key={d} className="flex items-center gap-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={descripcionesSeleccionadas.has(d)}
                        onChange={(e) => {
                          setDescripcionesSeleccionadas((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(d);
                            else next.delete(d);
                            return next;
                          });
                        }}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                  {!descripcionOptionsFiltradas.length && (
                    <div className="py-1 text-xs text-slate-500">Sin resultados</div>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDescripcionesSeleccionadas(new Set())}
                    className="rounded border px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDescripcionOpen(false)}
                    className="rounded border px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
          <select value={tipoCuadrilla} onChange={(e) => setTipoCuadrilla(e.target.value)} className="ui-select-inline ui-select-inline lg:col-span-1">
            <option value="todas">Todas</option>
            <option value="residencial">Residencial</option>
            <option value="condominio">Condominio</option>
          </select>
          {viewerScope === "all" && (
            <select value={coordinadorFiltro} onChange={(e) => setCoordinadorFiltro(e.target.value)} className="ui-select-inline ui-select-inline lg:col-span-1">
              {coordinadoresOptions.map((opt) => (
                <option key={opt} value={opt}>{opt === "todos" ? "Todos los coordinadores" : opt}</option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
            Solo con stock
          </label>
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setTipoCuadrilla("todas");
              setCoordinadorFiltro("todos");
              setSoloConStock(true);
              setEquipoFiltro("todos");
              setDescripcionesSeleccionadas(new Set());
              setDescripcionQuery("");
              setDescripcionOpen(false);
              setBusquedaSerie("");
              setSeleccionDetalle(null);
            }}
            className="rounded border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {viewerScope === "all" && kpiAlmacen.map((k) => (
          <div key={`alm-${k.tipo}`} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
            <div className="text-xs uppercase text-slate-500">{k.tipo}</div>
            <div className="text-2xl font-semibold">{k.cantidad}</div>
            <div className="text-xs text-slate-500">En almacen</div>
          </div>
        ))}
        {kpiCampo.map((k) => (
          <div key={`cam-${k.tipo}`} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
            <div className="text-xs uppercase text-slate-500">{k.tipo}</div>
            <div className="text-2xl font-semibold">{k.cantidad}</div>
            <div className="text-xs text-slate-500">En campo</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Resumen por cuadrilla</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
              <tr className="text-left">
                <th className="p-2">Cuadrilla</th>
                <th className="p-2 text-right">ONT</th>
                <th className="p-2 text-right">MESH</th>
                <th className="p-2 text-right">FONO</th>
                <th className="p-2 text-right">BOX</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Coordinador</th>
                <th className="p-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {resumenCampoPorCuadrilla.map((row) => (
                <tr key={row.nombre} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="p-2 font-medium">{row.nombre}</td>
                  <td className="p-2 text-right">{row.ONT}</td>
                  <td className="p-2 text-right">{row.MESH}</td>
                  <td className="p-2 text-right">{row.FONO}</td>
                  <td className="p-2 text-right">{row.BOX}</td>
                  <td className="p-2 text-right font-semibold">{equipoFiltro === "todos" ? row.total : row[equipoFiltro]}</td>
                  <td className="p-2">{row.tipoLabel || "-"}</td>
                  <td className="p-2">{row.coordinadorName || "-"}</td>
                  <td className="p-2">
                    <button type="button" onClick={() => setSeleccionDetalle(row.nombre)} className="rounded border px-2 py-1 text-xs hover:bg-slate-100">
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && resumenCampoPorCuadrilla.length === 0 && (
                <tr><td className="p-4 text-center text-slate-500" colSpan={9}>Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {seleccionDetalle && (
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">Detalle de equipos - {seleccionDetalle}</h3>
              <p className="text-xs text-slate-500">
                Tecnicos: {detalleSeleccion.tecnicos.join(", ") || "-"} | Gestor: {detalleSeleccion.gestor || "-"} | Coordinador: {detalleSeleccion.coordinador || "-"}
              </p>
            </div>
            <button type="button" onClick={() => setSeleccionDetalle(null)} className="rounded border px-2 py-1 text-xs hover:bg-slate-100">
              Cerrar
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                <tr className="text-left">
                  <th className="p-2">SN</th>
                  <th className="p-2">Equipo</th>
                  <th className="p-2">Descripcion</th>
                  <th className="p-2">Fecha despacho</th>
                  <th className="p-2">Guia despacho</th>
                  <th className="p-2">Tecnico</th>
                </tr>
              </thead>
              <tbody>
                {detalleSeleccion.rows.map((it: any) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2 font-mono">{it.SN}</td>
                    <td className="p-2">{it.equipo}</td>
                    <td className="p-2">{it.descripcion || "-"}</td>
                    <td className="p-2">{it.fechaDespacho || "-"}</td>
                    <td className="p-2">
                      {it.guiaDespacho ? (
                        <button
                          type="button"
                          onClick={() => abrirGuiaDespacho(String(it.guiaDespacho))}
                          className="text-blue-700 hover:underline"
                        >
                          {it.guiaDespacho}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-2">{it.tecnico || "-"}</td>
                  </tr>
                ))}
                {detalleSeleccion.rows.length === 0 && (
                  <tr><td className="p-4 text-center text-slate-500" colSpan={6}>Sin equipos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewerScope === "all" && (
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Series en almacen</h2>
            <div className="text-xs text-slate-600">
              {TIPOS.map((t) => `${t}: ${seriesAlmacen.totales[t] || 0}`).join(" | ")} | Total: {seriesAlmacen.total}
            </div>
          </div>
          <div className="mb-3">
            <input
              value={busquedaSerie}
              onChange={(e) => setBusquedaSerie(e.target.value)}
              placeholder="Buscar por SN / guia / descripcion"
              className="ui-input md:w-96"
            />
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                <tr className="text-left">
                  <th className="p-2">SN</th>
                  <th className="p-2">Equipo</th>
                  <th className="p-2">Descripcion</th>
                  <th className="p-2">Fecha ingreso</th>
                  <th className="p-2">Guia ingreso</th>
                </tr>
              </thead>
              <tbody>
                {seriesAlmacen.rows.map((it: any) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-2 font-mono">{it.SN}</td>
                    <td className="p-2">{it.equipo}</td>
                    <td className="p-2">{it.descripcion || "-"}</td>
                    <td className="p-2">{it.fechaIngreso || "-"}</td>
                    <td className="p-2">{it.guiaIngreso || "-"}</td>
                  </tr>
                ))}
                {seriesAlmacen.rows.length === 0 && (
                  <tr><td className="p-4 text-center text-slate-500" colSpan={5}>Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}




