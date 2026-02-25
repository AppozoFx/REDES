"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const Chip = ({ color = "slate", children }: { color?: string; children: any }) => {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-700 ring-green-200",
    red: "bg-red-100 text-red-700 ring-red-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    orange: "bg-orange-100 text-orange-700 ring-orange-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${map[color]}`}>
      {children}
    </span>
  );
};

type TecnicoRow = {
  id: string;
  nombres: string;
  apellidos: string;
  nombreCorto: string;
  dni_ce?: string;
  celular?: string;
  email?: string;
  fecha_nacimiento?: string;
  estado_usuario?: string;
  cuadrillaId?: string;
  cuadrillaNombre?: string;
};

const firstWord = (v: string) => String(v || "").trim().split(/\s+/)[0] || "";

export default function TecnicosGestionClient() {
  const [rows, setRows] = useState<TecnicoRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ celular?: string; estado_usuario?: string; dni_ce?: string; fecha_nacimiento?: string }>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/tecnicos/gestion/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      setRows(data.items || []);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando técnicos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const resumen = useMemo(() => {
    const total = rows.length;
    const activos = rows.filter((r) => String(r.estado_usuario || "").toLowerCase() === "activo").length;
    const inactivos = rows.filter((r) => String(r.estado_usuario || "").toLowerCase() === "inactivo").length;
    return { total, activos, inactivos };
  }, [rows]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = !q
      ? rows
      : rows.filter((t) =>
          `${t.nombres || ""} ${t.apellidos || ""}`.toLowerCase().includes(q)
        );
    const group = (name: string) => (/RESIDENCIAL/i.test(name) ? 0 : /MOTO/i.test(name) ? 1 : 2);
    const num = (name: string) => {
      const m = String(name || "").match(/K\s*(\d+)/i);
      return m ? Number(m[1]) : 9999;
    };
    return [...base].sort((a, b) => {
      const ga = group(a.cuadrillaNombre || "");
      const gb = group(b.cuadrillaNombre || "");
      if (ga !== gb) return ga - gb;
      const na = num(a.cuadrillaNombre || "");
      const nb = num(b.cuadrillaNombre || "");
      if (na !== nb) return na - nb;
      return String(a.cuadrillaNombre || "").localeCompare(String(b.cuadrillaNombre || ""), "es", { sensitivity: "base" });
    });
  }, [rows, filtro]);

  const startEdit = (t: TecnicoRow) => {
    setEditId(t.id);
    setForm({
      celular: t.celular || "",
      estado_usuario: t.estado_usuario || "activo",
      dni_ce: t.dni_ce || "",
      fecha_nacimiento: t.fecha_nacimiento || "",
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({});
  };

  const saveEdit = async (id: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/tecnicos/gestion/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          celular: form.celular || "",
          dni_ce: form.dni_ce || "",
          fecha_nacimiento: form.fecha_nacimiento || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      await cargar();
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
          <div className="text-xs text-gray-500 dark:text-slate-400">Activos</div>
          <div className="text-2xl font-semibold text-emerald-700">{resumen.activos}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-gray-500 dark:text-slate-400">Inactivos</div>
          <div className="text-2xl font-semibold text-rose-700">{resumen.inactivos}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full md:max-w-md rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            onClick={cargar}
            className="px-3 py-2 rounded bg-slate-800 text-white text-sm hover:bg-slate-900"
          >
            Recargar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="p-2 text-left">DNI/CE</th>
              <th className="p-2 text-left">Nombres</th>
              <th className="p-2 text-left">Apellidos</th>
              <th className="p-2 text-left">Celular</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Fecha Nac.</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Cuadrilla</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!cargando && filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  No hay técnicos para mostrar.
                </td>
              </tr>
            )}
            {!cargando &&
              filtrados.map((t) => {
                const estado = String(t.estado_usuario || "").toLowerCase();
                const estadoColor = estado === "activo" ? "green" : estado === "inactivo" ? "red" : "slate";
                const editing = editId === t.id;
                return (
                  <tr key={t.id} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                    <td className="p-2">
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={form.dni_ce || ""}
                          onChange={(e) => setForm((p) => ({ ...p, dni_ce: e.target.value }))}
                        />
                      ) : (
                        t.dni_ce || "-"
                      )}
                    </td>
                    <td className="p-2">{firstWord(t.nombres) || "-"}</td>
                    <td className="p-2">{firstWord(t.apellidos) || "-"}</td>
                    <td className="p-2">
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={form.celular || ""}
                          onChange={(e) => setForm((p) => ({ ...p, celular: e.target.value }))}
                        />
                      ) : (
                        t.celular || "-"
                      )}
                    </td>
                    <td className="p-2">
                      <span className="block max-w-[200px] truncate" title={t.email || "-"}>
                        {t.email || "-"}
                      </span>
                    </td>
                    <td className="p-2">
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          value={form.fecha_nacimiento || ""}
                          onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                        />
                      ) : (
                        t.fecha_nacimiento || "-"
                      )}
                    </td>
                    <td className="p-2">
                      <Chip color={estadoColor}>{estado || "-"}</Chip>
                    </td>
                    <td className="p-2">
                      {t.cuadrillaNombre ? <Chip color="orange">{t.cuadrillaNombre}</Chip> : <Chip>-</Chip>}
                    </td>
                    <td className="p-2">
                      {editing ? (
                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={savingId === t.id}
                            onClick={() => saveEdit(t.id)}
                          >
                            {savingId === t.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
                            onClick={cancelEdit}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="px-3 py-1 rounded bg-slate-800 text-white hover:bg-slate-900"
                          onClick={() => startEdit(t)}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
