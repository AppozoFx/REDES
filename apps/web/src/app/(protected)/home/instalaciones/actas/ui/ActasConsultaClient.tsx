"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

type LookupInstalacion = {
  id: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  tipoOrden: string;
  liquidado: boolean;
  liquidadoAt: string;
  correccionPendiente: boolean;
};

type LookupResp = {
  ok: boolean;
  acta: string;
  recepcionada: boolean;
  liquidada: boolean;
  canRelease: boolean;
  actaDoc: {
    exists: boolean;
    estado: string;
    instalacionId: string;
    codigoCliente: string;
    cliente: string;
    coordinadorNombre: string;
    cuadrillaNombre: string;
    recibidoAt: string;
    liquidadaAt: string;
  };
  instalaciones: LookupInstalacion[];
  error?: string;
};

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

const pill = (ok: boolean) =>
  ok
    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
    : "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";

export default function ActasConsultaClient() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [data, setData] = useState<LookupResp | null>(null);

  const acta = useMemo(() => normalizeActa(code), [code]);

  const buscar = async () => {
    if (!acta) return toast.error("Ingresa una acta valida");
    try {
      setLoading(true);
      const res = await fetch(`/api/actas/lookup?acta=${encodeURIComponent(acta)}`, { cache: "no-store" });
      const body = (await res.json()) as LookupResp;
      if (!res.ok || !body?.ok) throw new Error(body?.error || "ERROR");
      setData(body);
    } catch (e: any) {
      setData(null);
      toast.error(e?.message || "Error consultando acta");
    } finally {
      setLoading(false);
    }
  };

  const liberar = async () => {
    if (!data?.acta) return;
    if (!data.canRelease) return toast.error("Esta acta no requiere liberacion");
    const ok = window.confirm(
      `Vas a liberar el acta ${data.acta}. Esto la dejara disponible para liquidarla en el cliente correcto. ¿Continuar?`
    );
    if (!ok) return;
    try {
      setReleasing(true);
      const res = await fetch("/api/actas/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acta: data.acta,
          instalacionId: data.actaDoc.instalacionId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.error || "ERROR");
      toast.success(`Acta ${data.acta} liberada`);
      await buscar();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo liberar el acta");
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Buscar acta</label>
          <input
            value={code}
            onChange={(e) => setCode(normalizeActa(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void buscar();
              }
            }}
            placeholder="Ej: 005-0068681"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
          <button
            type="button"
            onClick={() => void liberar()}
            disabled={releasing || !data?.canRelease}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {releasing ? "Liberando..." : "Liberar acta"}
          </button>
        </div>
      </div>

      {data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Acta: {data.acta}</span>
              <span className={pill(data.recepcionada)}>
                {data.recepcionada ? "Recepcionada" : "No recepcionada"}
              </span>
              <span className={pill(data.liquidada)}>{data.liquidada ? "Liquidada" : "No liquidada"}</span>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <b>Estado acta:</b> {data.actaDoc.estado || "-"}
              </div>
              <div>
                <b>Instalacion vinculada:</b> {data.actaDoc.instalacionId || "-"}
              </div>
              <div>
                <b>Cliente (acta):</b> {data.actaDoc.cliente || "-"}
              </div>
              <div>
                <b>Codigo (acta):</b> {data.actaDoc.codigoCliente || "-"}
              </div>
              <div>
                <b>Coordinador:</b> {data.actaDoc.coordinadorNombre || "-"}
              </div>
              <div>
                <b>Cuadrilla:</b> {data.actaDoc.cuadrillaNombre || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 text-sm font-semibold">Coincidencias en instalaciones</div>
            {data.instalaciones.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay instalaciones con esta acta.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800/70">
                    <tr>
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Codigo</th>
                      <th className="p-2 text-left">Cliente</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Cuadrilla</th>
                      <th className="p-2 text-left">Liquidado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.instalaciones.map((x) => (
                      <tr key={x.id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="p-2">{x.id}</td>
                        <td className="p-2">{x.codigoCliente || "-"}</td>
                        <td className="p-2">{x.cliente || "-"}</td>
                        <td className="p-2">{x.tipoOrden || "-"}</td>
                        <td className="p-2">{x.cuadrillaNombre || "-"}</td>
                        <td className="p-2">{x.liquidado ? "SI" : "NO"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

