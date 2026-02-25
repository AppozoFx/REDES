"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Row = {
  uid: string;
  nombre: string;
  email: string;
  celular: string;
  razonSocial: string;
  ruc: string;
};

export default function CoordinadoresClient() {
  const [loading, setLoading] = useState(true);
  const [savingUid, setSavingUid] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gerencia/coordinadores", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows(Array.isArray(body.items) ? body.items : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar coordinadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      `${r.nombre} ${r.email} ${r.celular} ${r.razonSocial} ${r.ruc}`.toLowerCase().includes(t)
    );
  }, [q, rows]);

  const onChange = (uid: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const onSave = async (row: Row) => {
    if (!row.razonSocial.trim()) {
      toast.error("Razon social es obligatoria");
      return;
    }
    const ruc = row.ruc.replace(/\D/g, "");
    if (!/^\d{11}$/.test(ruc)) {
      toast.error("RUC debe tener 11 digitos");
      return;
    }

    setSavingUid(row.uid);
    try {
      const res = await fetch("/api/gerencia/coordinadores", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uid: row.uid,
          razonSocial: row.razonSocial,
          ruc,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      toast.success("Coordinador actualizado");
      onChange(row.uid, { ruc });
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSavingUid("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Coordinadores</h2>
            <p className="text-sm text-slate-500">
              Administra razon social y RUC para ordenes de compra.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Total visibles: {visible.length}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar coordinador"
            className="h-10 min-w-[240px] rounded-xl border border-slate-300 px-3 text-sm"
          />
          <button
            type="button"
            onClick={cargar}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="border border-slate-200 p-2 text-left">Coordinador</th>
              <th className="border border-slate-200 p-2 text-left">Email</th>
              <th className="border border-slate-200 p-2 text-left">Celular</th>
              <th className="border border-slate-200 p-2 text-left">Razon social</th>
              <th className="border border-slate-200 p-2 text-left">RUC</th>
              <th className="border border-slate-200 p-2 text-left">Accion</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="border border-slate-200 p-4 text-center text-slate-500" colSpan={6}>
                  Cargando...
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((r) => (
                <tr key={r.uid} className="odd:bg-white even:bg-slate-50/60">
                  <td className="border border-slate-200 p-2 font-medium text-slate-800">{r.nombre}</td>
                  <td className="border border-slate-200 p-2">{r.email || "-"}</td>
                  <td className="border border-slate-200 p-2">{r.celular || "-"}</td>
                  <td className="border border-slate-200 p-2">
                    <input
                      value={r.razonSocial}
                      onChange={(e) => onChange(r.uid, { razonSocial: e.target.value })}
                      className="h-9 w-full rounded-lg border border-slate-300 px-2"
                      placeholder="Razon social"
                    />
                  </td>
                  <td className="border border-slate-200 p-2">
                    <input
                      value={r.ruc}
                      onChange={(e) =>
                        onChange(r.uid, { ruc: e.target.value.replace(/\D/g, "").slice(0, 11) })
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 px-2"
                      placeholder="11 digitos"
                    />
                  </td>
                  <td className="border border-slate-200 p-2">
                    <button
                      type="button"
                      disabled={savingUid === r.uid}
                      onClick={() => onSave(r)}
                      className="rounded-xl bg-[#30518c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingUid === r.uid ? "Guardando..." : "Guardar"}
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && !visible.length && (
              <tr>
                <td className="border border-slate-200 p-4 text-center text-slate-500" colSpan={6}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
