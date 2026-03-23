"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  status?: string;
  telegram?: {
    chatTitle?: string;
    fromName?: string;
    messageThreadId?: string;
  };
  parsing?: {
    extracted?: {
      ticketNumero?: string;
      ctoNap?: string;
      distrito?: string;
    } | null;
  };
  mapping?: {
    cuadrillaNombre?: string;
    cuadrillaId?: string;
  };
  normalizedPayload?: {
    ticketNumero?: string;
  } | null;
  createTicket?: {
    createdId?: string;
    error?: string;
  };
};

export default function TelegramMantenimientoIngresosClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPERATIVOS");
  const [creatingId, setCreatingId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/integrations/telegram/mantenimiento/ingresos?limit=200", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows(Array.isArray(body.items) ? body.items : []);
    } catch (e: any) {
      setError(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "OPERATIVOS" && row.status === "PARSE_FAILED") return false;
      if (statusFilter !== "OPERATIVOS" && statusFilter !== "TODOS" && row.status !== statusFilter) return false;
      const hay = [
        row.id,
        row.status || "",
        row.telegram?.chatTitle || "",
        row.telegram?.fromName || "",
        row.parsing?.extracted?.ticketNumero || "",
        row.parsing?.extracted?.ctoNap || "",
        row.parsing?.extracted?.distrito || "",
        row.mapping?.cuadrillaNombre || "",
      ]
        .join(" ")
        .toLowerCase();
      return !needle || hay.includes(needle);
    });
  }, [rows, q, statusFilter]);

  async function createTicket(ingresoId: string) {
    setCreatingId(ingresoId);
    setError("");
    try {
      const res = await fetch("/api/integrations/telegram/mantenimiento/create-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ingresoId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      await load();
    } catch (e: any) {
      setError(String(e?.message || "ERROR"));
    } finally {
      setCreatingId("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#f6f8fc] via-white to-[#eef6f1] shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-7">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-600 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
              Telegram
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Ingresos mantenimiento</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Revisa mensajes parseados, valida mappings y crea tickets reales solo cuando el ingreso este listo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load().catch(() => {})}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Recargar
            </button>
            <Link
              href="/home/mantenimiento/liquidaciones"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Volver a tickets
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ticket, CTO, distrito, cuadrilla o estado"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="OPERATIVOS">Operativos</option>
            <option value="TODOS">Todos</option>
            <option value="READY_FOR_CREATE">READY_FOR_CREATE</option>
            <option value="CREATED">CREATED</option>
            <option value="CREATE_FAILED">CREATE_FAILED</option>
            <option value="MAPPING_MISSING">MAPPING_MISSING</option>
            <option value="PARSE_FAILED">PARSE_FAILED</option>
          </select>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {loading ? <div className="text-sm text-slate-500">Cargando...</div> : null}
        {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {!loading && !error ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left">
                  <th className="p-2">Estado</th>
                  <th className="p-2">Ticket</th>
                  <th className="p-2">CTO/NAP</th>
                  <th className="p-2">Distrito</th>
                  <th className="p-2">Tema</th>
                  <th className="p-2">Cuadrilla</th>
                  <th className="p-2">Creacion</th>
                  <th className="p-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const ready = row.status === "READY_FOR_CREATE";
                  const created = Boolean(row.createTicket?.createdId);
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="p-2">
                        <div className="font-medium">{row.status || "-"}</div>
                        <div className="text-xs text-slate-500">{row.id}</div>
                      </td>
                      <td className="p-2">{row.parsing?.extracted?.ticketNumero || row.normalizedPayload?.ticketNumero || "-"}</td>
                      <td className="p-2">{row.parsing?.extracted?.ctoNap || "-"}</td>
                      <td className="p-2">{row.parsing?.extracted?.distrito || "-"}</td>
                      <td className="p-2">
                        <div>{row.telegram?.chatTitle || "-"}</div>
                        <div className="text-xs text-slate-500">thread {row.telegram?.messageThreadId || "main"}</div>
                      </td>
                      <td className="p-2">{row.mapping?.cuadrillaNombre || row.mapping?.cuadrillaId || "-"}</td>
                      <td className="p-2">
                        {created ? (
                          <Link href={`/home/mantenimiento/liquidaciones/${row.createTicket?.createdId}`} className="text-emerald-700 hover:underline">
                            {row.createTicket?.createdId}
                          </Link>
                        ) : row.createTicket?.error ? (
                          <span className="text-red-600">{row.createTicket.error}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => createTicket(row.id)}
                          disabled={!ready || created || creatingId === row.id}
                          className="rounded-xl bg-[#1f5f4a] px-3 py-2 text-sm font-medium text-white hover:bg-[#184c3a] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {creatingId === row.id ? "Creando..." : created ? "Creado" : "Crear ticket"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">Sin ingresos para mostrar.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
