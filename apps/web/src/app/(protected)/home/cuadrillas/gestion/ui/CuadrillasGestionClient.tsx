"use client";

import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { toast } from "sonner";

type CuadrillaRow = {
  id: string;
  nombre: string;
  r_c: string;
  estado: string;
      zonaId?: string;
      tipoZona?: string;
      gestorUid?: string;
      coordinadorUid?: string;
      tecnicosUids?: string[];
};

type Option = { value: string; label: string; tipo?: string };

  type EditState = {
    zonaId?: string;
    tipoZona?: string;
    gestorUid?: string;
    coordinadorUid?: string;
    tecnicosUids?: string[];
  };

export default function CuadrillasGestionClient() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(root.classList.contains("dark") || mq.matches);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener?.("change", sync);
    return () => {
      obs.disconnect();
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  const selectStyles = isDark
    ? {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
        control: (base: any, state: any) => ({
          ...base,
          backgroundColor: "#020617",
          borderColor: state.isFocused ? "#38bdf8" : "#334155",
          boxShadow: "none",
        }),
        menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
        option: (base: any, state: any) => ({
          ...base,
          backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
          color: "#e2e8f0",
        }),
        input: (base: any) => ({ ...base, color: "#e2e8f0" }),
        placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
        singleValue: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
        multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValueRemove: (base: any) => ({ ...base, color: "#cbd5e1" }),
      }
    : {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
      };

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed" as const,
    styles: selectStyles,
  };

  const [rows, setRows] = useState<CuadrillaRow[]>([]);
  const [zonas, setZonas] = useState<Option[]>([]);
  const [gestores, setGestores] = useState<Option[]>([]);
  const [coordinadores, setCoordinadores] = useState<Option[]>([]);
  const [tecnicos, setTecnicos] = useState<Option[]>([]);
  const [assignedAll, setAssignedAll] = useState<Set<string>>(new Set());
  const [coordReadOnly, setCoordReadOnly] = useState(false);

  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroGestor, setFiltroGestor] = useState("");
  const [filtroCoordinador, setFiltroCoordinador] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargarContexto = async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    const roles = Array.isArray(data.roles)
      ? data.roles.map((r: any) => String(r || "").toUpperCase())
      : [];
    const isAdmin = Boolean(data.isAdmin);
    const isCoord = roles.includes("COORDINADOR");
    const isPriv = roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");
    const isGestor = roles.includes("GESTOR");
    setCoordReadOnly(isCoord && !isAdmin && !isPriv && !isGestor);
  };

  const cargarBase = async () => {
    const res = await fetch("/api/cuadrillas/list?area=INSTALACIONES&includeAll=true", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    const items = Array.isArray(data.items) ? data.items : [];
    setRows(items);
    const assigned = Array.isArray(data.assignedTecnicosAll) ? data.assignedTecnicosAll : [];
    setAssignedAll(new Set(assigned.map((x: string) => String(x || "").trim()).filter(Boolean)));
  };

  const cargarZonas = async () => {
    const res = await fetch("/api/zonas/list?estado=HABILITADO", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    const items = Array.isArray(data.items) ? data.items : [];
    setZonas(items.map((z: any) => ({ value: z.id, label: z.nombre || z.id, tipo: z.tipo || "" })));
  };

  const cargarUsuarios = async () => {
    const fetchRole = async (role: string) => {
      const res = await fetch(`/api/usuarios/by-role?role=${encodeURIComponent(role)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      const items = Array.isArray(data.items) ? data.items : [];
      return items.map((u: any) => ({ value: u.uid, label: u.label || u.uid }));
    };

    const [gs, cs, ts] = await Promise.all([
      fetchRole("GESTOR"),
      fetchRole("COORDINADOR"),
      fetchRole("TECNICO"),
    ]);
    setGestores(gs);
    setCoordinadores(cs);
    setTecnicos(ts);
  };

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([cargarContexto(), cargarBase(), cargarZonas(), cargarUsuarios()]);
      } catch (e: any) {
        toast.error(e?.message || "Error cargando datos");
      }
    })();
  }, []);

  const resumen = useMemo(() => {
    const total = rows.length;
    const habilitadas = rows.filter((r) => String(r.estado || "").toUpperCase() === "HABILITADO").length;
    const inhabilitadas = rows.filter((r) => String(r.estado || "").toUpperCase() === "INHABILITADO").length;
    return { total, habilitadas, inhabilitadas };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filtroNombre.toLowerCase().trim();
    const g = filtroGestor.trim();
    const c = filtroCoordinador.trim();
    const base = rows.filter((r) => {
      const estadoOk = String(r.estado || "").toUpperCase() === "HABILITADO";
      const okQ = q ? String(r.nombre || "").toLowerCase().includes(q) : true;
      const okG = g ? String(r.gestorUid || "") === g : true;
      const okC = c ? String(r.coordinadorUid || "") === c : true;
      return estadoOk && okQ && okG && okC;
    });
    const group = (name: string) => (/RESIDENCIAL/i.test(name) ? 0 : /MOTO/i.test(name) ? 1 : 2);
    const num = (name: string) => {
      const m = String(name || "").match(/K\s*(\d+)/i);
      return m ? Number(m[1]) : 9999;
    };
    return base.sort((a, b) => {
      const ga = group(a.nombre || "");
      const gb = group(b.nombre || "");
      if (ga !== gb) return ga - gb;
      const na = num(a.nombre || "");
      const nb = num(b.nombre || "");
      if (na !== nb) return na - nb;
      return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
    });
  }, [rows, filtroNombre, filtroGestor, filtroCoordinador]);

  const startEdit = (row: CuadrillaRow) => {
    if (coordReadOnly) return;
    setEditingId(row.id);
    setForm({
      zonaId: row.zonaId || "",
      tipoZona: row.tipoZona || "",
      gestorUid: row.gestorUid || "",
      coordinadorUid: row.coordinadorUid || "",
      tecnicosUids: Array.isArray(row.tecnicosUids) ? row.tecnicosUids : [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  const saveEdit = async (row: CuadrillaRow) => {
    if (coordReadOnly) return;
    if (!editingId) return;
    const payload = {
      id: row.id,
      zonaId: form.zonaId ?? "",
      tipoZona: form.tipoZona ?? "",
      gestorUid: form.gestorUid ?? "",
      coordinadorUid: form.coordinadorUid ?? "",
      tecnicosUids: form.tecnicosUids ?? [],
    };
    try {
      setSavingId(row.id);
      const res = await fetch("/api/cuadrillas/gestion/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      await cargarBase();
      toast.success("Cambios guardados");
      cancelEdit();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-3 text-slate-900 dark:text-slate-100">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-slate-400">Total</div>
          <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{resumen.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-slate-400">Habilitadas</div>
          <div className="text-2xl font-semibold text-emerald-700">{resumen.habilitadas}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-slate-400">Inhabilitadas</div>
          <div className="text-2xl font-semibold text-rose-700">{resumen.inhabilitadas}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Buscar por nombre"
            value={filtroNombre}
            onChange={(e) => setFiltroNombre(e.target.value)}
          />
          <Select
            classNamePrefix="gestor-filter"
            placeholder="Filtrar por gestor"
            options={gestores}
            isClearable
            value={gestores.find((g) => g.value === filtroGestor) || null}
            onChange={(sel) => setFiltroGestor(sel?.value || "")}
            {...selectPortalProps}
          />
          {!coordReadOnly ? (
            <Select
              classNamePrefix="coord-filter"
              placeholder="Filtrar por coordinador"
              options={coordinadores}
              isClearable
              value={coordinadores.find((c) => c.value === filtroCoordinador) || null}
              onChange={(sel) => setFiltroCoordinador(sel?.value || "")}
              {...selectPortalProps}
            />
          ) : (
            <div className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              Modo coordinador: solo lectura
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">R/C</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Zona</th>
              <th className="p-2 text-left">Tipo Zona</th>
              <th className="p-2 text-left">Gestor</th>
              <th className="p-2 text-left">Coordinador</th>
              <th className="p-2 text-left">Técnicos</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const editing = editingId === row.id;
              return (
                <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                  <td className="p-2 font-medium">{row.nombre}</td>
                  <td className="p-2">{row.r_c || "-"}</td>
                  <td className="p-2">{row.estado || "-"}</td>
                  <td className="p-2 min-w-[220px]">
                    {editing ? (
                      <Select
                        options={zonas}
                        value={zonas.find((z) => z.value === form.zonaId) || null}
                        onChange={(sel) =>
                          setForm((p) => ({
                            ...p,
                            zonaId: sel?.value || "",
                            tipoZona: sel?.tipo || "",
                          }))
                        }
                        placeholder="Seleccionar zona"
                        {...selectPortalProps}
                      />
                    ) : (
                      zonas.find((z) => z.value === row.zonaId)?.label || row.zonaId || "-"
                    )}
                  </td>
                  <td className="p-2 min-w-[160px]">
                    {editing ? (
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        value={form.tipoZona || ""}
                        onChange={(e) => setForm((p) => ({ ...p, tipoZona: e.target.value }))}
                        readOnly
                        disabled
                      />
                    ) : (
                      row.tipoZona || "-"
                    )}
                  </td>
                  <td className="p-2 min-w-[200px]">
                    {editing ? (
                      <Select
                        options={gestores}
                        value={gestores.find((g) => g.value === form.gestorUid) || null}
                        onChange={(sel) => setForm((p) => ({ ...p, gestorUid: sel?.value || "" }))}
                        placeholder="Seleccionar gestor"
                        {...selectPortalProps}
                      />
                    ) : (
                      gestores.find((g) => g.value === row.gestorUid)?.label || row.gestorUid || "-"
                    )}
                  </td>
                  <td className="p-2 min-w-[200px]">
                    {editing ? (
                      <Select
                        options={coordinadores}
                        value={coordinadores.find((c) => c.value === form.coordinadorUid) || null}
                        onChange={(sel) => setForm((p) => ({ ...p, coordinadorUid: sel?.value || "" }))}
                        placeholder="Seleccionar coordinador"
                        {...selectPortalProps}
                      />
                    ) : (
                      coordinadores.find((c) => c.value === row.coordinadorUid)?.label ||
                      row.coordinadorUid ||
                      "-"
                    )}
                  </td>
                  <td className="p-2 min-w-[280px]">
                    {editing ? (
                      <Select
                        isMulti
                        options={tecnicos.filter(
                          (t) =>
                            !assignedAll.has(String(t.value || "").trim()) ||
                            (form.tecnicosUids || []).includes(t.value)
                        )}
                        value={tecnicos.filter((t) => (form.tecnicosUids || []).includes(t.value))}
                        onChange={(sel) =>
                          setForm((p) => ({ ...p, tecnicosUids: (sel || []).map((s) => s.value) }))
                        }
                        placeholder="Seleccionar tecnicos"
                        {...selectPortalProps}
                      />
                    ) : (
                      (row.tecnicosUids || [])
                        .map((uid) => tecnicos.find((t) => t.value === uid)?.label || uid)
                        .join(", ") || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {editing ? (
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          disabled={savingId === row.id}
                          onClick={() => saveEdit(row)}
                        >
                          {savingId === row.id ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
                          onClick={cancelEdit}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : coordReadOnly ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">Solo lectura</span>
                    ) : (
                      <button
                        className="px-3 py-1 rounded bg-slate-800 text-white hover:bg-slate-900"
                        onClick={() => startEdit(row)}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  No hay cuadrillas para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
