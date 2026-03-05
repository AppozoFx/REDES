"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { actualizarCuotasVentaAction, registrarPagoVentaAction, anularVentaAction } from "../server-actions";

type VentaDoc = {
  id: string;
  area: "INSTALACIONES" | "MANTENIMIENTO";
  cuadrillaId: string;
  cuadrillaNombre?: string;
  coordinadorUid: string;
  coordinadorNombre?: string;
  destinoType?: "CUADRILLA" | "COORDINADOR";
  observacion?: string;
  totalCents: number;
  saldoPendienteCents: number;
  cuotasTotal: number;
  cuotasPagadas: number;
  estado: string;
  createdAtStr?: string;
};

type VentaItemDoc = {
  materialId: string;
  nombre?: string;
  unidadTipo?: "UND" | "METROS";
  und?: number;
  metros?: number;
  precioUnitCents?: number;
  subtotalCents?: number;
};

type CuotaDoc = {
  id: string;
  n: number;
  montoCents: number;
  pagadoMontoCents?: number;
  estado?: string;
};

function centsToMoney(cents: number) {
  return (Math.round(cents || 0) / 100).toFixed(2);
}

function moneyToCents(n: number) {
  return Math.round((n || 0) * 100);
}

function toNum(raw: string) {
  const n = Number(String(raw || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function estadoBadgeClass(estadoRaw: string) {
  const e = String(estadoRaw || "").toUpperCase();
  if (e === "PAGADO") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  }
  if (e === "ANULADO" || e === "ANULADA") {
    return "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300";
  }
  return "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
}

export default function VentasClient({
  canEdit,
  canPagar,
  canAnular,
  canViewAll,
}: {
  canEdit: boolean;
  canPagar: boolean;
  canAnular: boolean;
  canViewAll: boolean;
}) {
  const [viewerUid, setViewerUid] = useState("");
  const [viewerNombre, setViewerNombre] = useState("");
  const [isCoordViewer, setIsCoordViewer] = useState(false);
  const [viewerAreas, setViewerAreas] = useState<Array<"INSTALACIONES" | "MANTENIMIENTO">>([]);
  const [areaFilter, setAreaFilter] = useState<"ALL" | "INSTALACIONES" | "MANTENIMIENTO">("ALL");
  const [coordFilter, setCoordFilter] = useState("");
  const [coordinadores, setCoordinadores] = useState<Array<{ uid: string; label: string }>>([]);
  const [onlyPending, setOnlyPending] = useState(true);
  const now = new Date();
  const [yearFilter, setYearFilter] = useState<number | "ALL">(now.getUTCFullYear());
  const [monthFilter, setMonthFilter] = useState<number | "ALL">(now.getUTCMonth() + 1);
  const [ventas, setVentas] = useState<VentaDoc[]>([]);
  const [pageInfo, setPageInfo] = useState<{ hasMore: boolean; lastId: string; lastCreatedAtMs: number }>({
    hasMore: false,
    lastId: "",
    lastCreatedAtMs: 0,
  });
  const [loading, setLoading] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<VentaDoc | null>(null);
  const [cuotas, setCuotas] = useState<CuotaDoc[]>([]);
  const [cuotasDraft, setCuotasDraft] = useState<Array<{ n: number; monto: string }>>([]);
  const [cuotasCount, setCuotasCount] = useState(1);
  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState(false);
  const [detalleItems, setDetalleItems] = useState<VentaItemDoc[]>([]);

  async function abrirGuiaVentaPdf(ventaId: string, area: "INSTALACIONES" | "MANTENIMIENTO") {
    const areaPath = area === "MANTENIMIENTO" ? "mantenimiento" : "instalaciones";
    try {
      const res = await fetch(
        `/api/transferencias/${areaPath}/guia/url?guiaId=${encodeURIComponent(ventaId)}&tipo=ventas`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.url) throw new Error(String(data?.error || "NO_PDF"));
      const win = window.open(String(data.url), "_blank");
      if (win) win.opener = null;
    } catch {
      toast.error("No se encontro el PDF de la guia");
    }
  }

  async function loadVentas(reset = false) {
    setLoading(true);
    try {
      const qsParts: string[] = [];
      if (yearFilter !== "ALL") qsParts.push(`year=${yearFilter}`);
      if (yearFilter !== "ALL" && monthFilter !== "ALL") qsParts.push(`month=${monthFilter}`);
      qsParts.push("limit=100");
      if (!reset && pageInfo.lastId && pageInfo.lastCreatedAtMs) {
        qsParts.push(`startAfterId=${encodeURIComponent(pageInfo.lastId)}`);
        qsParts.push(`startAfterMs=${pageInfo.lastCreatedAtMs}`);
      }
      const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
      const res = await fetch(`/api/ventas/list${qs}`, { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data?.items) ? data.items : [];
      if (reset) {
        setVentas(list);
      } else {
        setVentas((prev) => [...prev, ...list]);
      }
      const pi = data?.pageInfo || {};
      setPageInfo({
        hasMore: Boolean(pi?.hasMore),
        lastId: String(pi?.lastId || ""),
        lastCreatedAtMs: Number(pi?.lastCreatedAtMs || 0),
      });
    } catch {}
    setLoading(false);
  }

  async function loadDetalle(ventaId: string) {
    try {
      const res = await fetch(`/api/ventas/detail?ventaId=${encodeURIComponent(ventaId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) return;
      const v = data.venta as VentaDoc;
      const cs = Array.isArray(data.cuotas) ? data.cuotas : [];
      const items = Array.isArray((data.venta as any)?.items) ? (data.venta as any).items : [];
      setSelectedVenta(v);
      setCuotas(cs);
      setDetalleItems(items);
      setCuotasDraft(cs.map((c: any) => ({ n: c.n, monto: centsToMoney(c.montoCents || 0) })));
      setCuotasCount(cs.length || 1);
      setPaymentInputs({});
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const uid = String(data?.uid || "");
        const nombre = String(data?.nombre || "");
        const roles = Array.isArray(data?.roles) ? data.roles.map((r: any) => String(r || "").toUpperCase()) : [];
        const areasRaw = Array.isArray(data?.areas) ? data.areas.map((a: any) => String(a || "").toUpperCase()) : [];
        const areas = areasRaw.filter((a: string) => a === "INSTALACIONES" || a === "MANTENIMIENTO") as Array<
          "INSTALACIONES" | "MANTENIMIENTO"
        >;
        const isCoord = roles.includes("COORDINADOR") && !Boolean(data?.isAdmin);
        setViewerUid(uid);
        setViewerNombre(nombre);
        setIsCoordViewer(isCoord);
        setViewerAreas(areas);
        if (isCoord && uid) {
          setCoordFilter(uid);
          if (areas.length === 1) setAreaFilter(areas[0]);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    setPageInfo({ hasMore: false, lastId: "", lastCreatedAtMs: 0 });
    loadVentas(true);
  }, [yearFilter, monthFilter]);

  const areaOptions = useMemo(() => {
    if (!isCoordViewer) return ["INSTALACIONES", "MANTENIMIENTO"] as const;
    const opts = viewerAreas.filter((a) => a === "INSTALACIONES" || a === "MANTENIMIENTO");
    return (opts.length ? opts : ["INSTALACIONES"]) as readonly ("INSTALACIONES" | "MANTENIMIENTO")[];
  }, [isCoordViewer, viewerAreas]);

  useEffect(() => {
    if (!isCoordViewer) return;
    if (!areaOptions.length) return;
    if (areaFilter === "ALL" || !areaOptions.includes(areaFilter)) {
      setAreaFilter(areaOptions[0]);
    }
  }, [isCoordViewer, areaFilter, areaOptions]);

  const ventasView = useMemo(() => {
    let list = ventas;
    if (isCoordViewer && viewerUid) {
      list = list.filter((v: any) => String(v?.coordinadorUid || "") === viewerUid);
    }
    if (areaFilter !== "ALL") {
      list = list.filter((v: any) => String(v?.area || "") === areaFilter);
    }
    if ((canViewAll || isCoordViewer) && coordFilter) {
      list = list.filter((v: any) => String(v?.coordinadorUid || "") === coordFilter);
    }
    if (onlyPending) {
      list = list.filter((v: any) => String(v?.estado || "") !== "PAGADO");
    }
    return list;
  }, [ventas, areaFilter, coordFilter, onlyPending, canViewAll, isCoordViewer, viewerUid]);

  useEffect(() => {
    if (!canViewAll && !isCoordViewer) return;
    (async () => {
      try {
        const res = await fetch("/api/usuarios/by-role?role=COORDINADOR", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (isCoordViewer) {
          const mine = items.filter((c: any) => String(c?.uid || "") === viewerUid);
          if (mine.length) {
            setCoordinadores(mine);
          } else if (viewerUid) {
            setCoordinadores([{ uid: viewerUid, label: viewerNombre || viewerUid }]);
          } else {
            setCoordinadores([]);
          }
        } else {
          setCoordinadores(items);
        }
      } catch {}
    })();
  }, [canViewAll, isCoordViewer, viewerUid, viewerNombre]);

  const totalCentsDraft = useMemo(() => {
    return cuotasDraft.reduce((acc, c) => acc + moneyToCents(toNum(c.monto)), 0);
  }, [cuotasDraft]);

  function splitCuotas(n: number) {
    if (!selectedVenta) return;
    const total = selectedVenta.totalCents;
    if (n <= 0) return;
    const base = Math.floor(total / n);
    const rest = total - base * n;
    const next = Array.from({ length: n }).map((_, i) => {
      const monto = base + (i === n - 1 ? rest : 0);
      return { n: i + 1, monto: centsToMoney(monto) };
    });
    setCuotasDraft(next);
  }

  async function saveCuotas() {
    if (!selectedVenta) return;
    setPendingAction(true);
    try {
      const payload = {
        ventaId: selectedVenta.id,
        cuotas: cuotasDraft.map((c) => ({
          n: c.n,
          montoCents: moneyToCents(toNum(c.monto)),
        })),
      };
      const res = await actualizarCuotasVentaAction(payload);
      if ((res as any)?.ok) {
        toast.success("Cuotas actualizadas");
        await loadDetalle(selectedVenta.id);
        await loadVentas();
      } else {
        const msg = (res as any)?.error?.formErrors?.join(", ") || "Error al actualizar cuotas";
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "ERROR"));
    } finally {
      setPendingAction(false);
    }
  }

  async function registrarPago(cuota: CuotaDoc) {
    if (!selectedVenta) return;
    const raw = paymentInputs[String(cuota.n)] || "";
    const monto = moneyToCents(toNum(raw));
    if (monto <= 0) return toast.error("Monto inválido");
    setPendingAction(true);
    try {
      const res = await registrarPagoVentaAction({
        ventaId: selectedVenta.id,
        cuotaN: cuota.n,
        montoCents: monto,
      });
      if ((res as any)?.ok) {
        toast.success("Pago registrado");
        await loadDetalle(selectedVenta.id);
        await loadVentas();
      } else {
        const msg = (res as any)?.error?.formErrors?.join(", ") || "Error al registrar pago";
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "ERROR"));
    } finally {
      setPendingAction(false);
    }
  }

  async function anularVenta() {
    if (!selectedVenta) return;
    setPendingAction(true);
    try {
      const res = await anularVentaAction({ ventaId: selectedVenta.id });
      if ((res as any)?.ok) {
        toast.success("Venta anulada");
        setSelectedVenta(null);
        setCuotas([]);
        setCuotasDraft([]);
        await loadVentas();
      } else {
        const msg = (res as any)?.error?.formErrors?.join(", ") || "Error al anular venta";
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "ERROR"));
    } finally {
      setPendingAction(false);
    }
  }

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <label className="text-sm">Área</label>
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value as any)}
          disabled={isCoordViewer && areaOptions.length <= 1}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {!isCoordViewer && <option value="ALL">Todas</option>}
          {areaOptions.includes("INSTALACIONES") && <option value="INSTALACIONES">Instalaciones</option>}
          {areaOptions.includes("MANTENIMIENTO") && <option value="MANTENIMIENTO">Mantenimiento</option>}
        </select>
        {(canViewAll || isCoordViewer) && (
          <>
            <label className="text-sm ml-2">Coordinador</label>
            <select
              value={coordFilter}
              onChange={(e) => setCoordFilter(e.target.value)}
              disabled={isCoordViewer}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {!isCoordViewer && <option value="">Todos</option>}
              {coordinadores.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.label}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="text-sm ml-2">Año</label>
        <select
          value={yearFilter}
          onChange={(e) => {
            const v = e.target.value === "ALL" ? "ALL" : Number(e.target.value);
            setYearFilter(v as any);
            if (v === "ALL") setMonthFilter("ALL");
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="ALL">Todos</option>
          {Array.from({ length: 5 }).map((_, i) => {
            const y = now.getUTCFullYear() - i;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
        <label className="text-sm ml-2">Mes</label>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          disabled={yearFilter === "ALL"}
        >
          <option value="ALL">Todos</option>
          {[
            "Enero",
            "Febrero",
            "Marzo",
            "Abril",
            "Mayo",
            "Junio",
            "Julio",
            "Agosto",
            "Septiembre",
            "Octubre",
            "Noviembre",
            "Diciembre",
          ].map((m, idx) => (
            <option key={m} value={idx + 1}>
              {m}
            </option>
          ))}
        </select>
        <label className="text-sm ml-2">Solo pendientes</label>
        <input
          type="checkbox"
          checked={onlyPending}
          onChange={(e) => setOnlyPending(e.target.checked)}
        />
        {loading && <span className="text-xs text-slate-500 dark:text-slate-400">Cargando...</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Área</th>
              <th className="text-left px-3 py-2">Cuadrilla</th>
              <th className="text-left px-3 py-2">Coordinador</th>
              <th className="text-left px-3 py-2">Cuadrilla</th>
              <th className="text-left px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Saldo</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-right px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {ventasView.map((v) => (
              <tr key={v.id} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                <td className="px-3 py-2 font-mono">
                  <button
                    type="button"
                    onClick={() => void abrirGuiaVentaPdf(v.id, v.area)}
                    className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                    title="Abrir PDF de la guia"
                  >
                    {v.id}
                  </button>
                </td>
                <td className="px-3 py-2">{v.area}</td>
                <td className="px-3 py-2">{v.cuadrillaNombre || v.cuadrillaId}</td>
                <td className="px-3 py-2">{v.coordinadorNombre || v.coordinadorUid}</td>
                <td className="px-3 py-2">{v.cuadrillaNombre || v.cuadrillaId || "-"}</td>
                <td className="px-3 py-2">{centsToMoney(v.totalCents)}</td>
                <td className="px-3 py-2">{centsToMoney(v.saldoPendienteCents)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoBadgeClass(v.estado)}`}>
                    {v.estado || "-"}
                  </span>
                </td>
                <td className="px-3 py-2">{v.createdAtStr || "-"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="rounded-lg border border-blue-300 px-2 py-1 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
                    onClick={() => loadDetalle(v.id)}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {ventasView.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">
                  No hay ventas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageInfo.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadVentas(false)}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {loading ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}

      {selectedVenta && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedVenta(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4" onClick={() => setSelectedVenta(null)}>
            <div
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium">
                  Detalle venta:{" "}
                  <button
                    type="button"
                    onClick={() => void abrirGuiaVentaPdf(selectedVenta.id, selectedVenta.area)}
                    className="font-mono text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                    title="Abrir PDF de la guia"
                  >
                    {selectedVenta.id}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    Estado:{" "}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoBadgeClass(selectedVenta.estado)}`}>
                      {selectedVenta.estado || "-"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedVenta(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

          <div className="text-sm">
            Total: {centsToMoney(selectedVenta.totalCents)} | Pagado:{" "}
            {centsToMoney(Math.max(0, (selectedVenta.totalCents || 0) - (selectedVenta.saldoPendienteCents || 0)))} | Saldo:{" "}
            {centsToMoney(selectedVenta.saldoPendienteCents)}
          </div>
          <div className="text-sm">
            Coordinador: {selectedVenta.coordinadorNombre || selectedVenta.coordinadorUid} | Cuadrilla:{" "}
            {selectedVenta.cuadrillaNombre || selectedVenta.cuadrillaId || "-"}
          </div>
          <div className="text-sm">
            Observación: {selectedVenta.observacion || "-"}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Materiales vendidos</div>
            {detalleItems.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Sin detalle de materiales.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-3 py-2 text-left">Unidad</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Precio unit.</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleItems.map((it, idx) => {
                      const unidad = String(it.unidadTipo || "UND");
                      const qty =
                        unidad === "METROS"
                          ? Number(it.metros || 0).toFixed(2)
                          : String(Math.floor(Number(it.und || 0)));
                      return (
                        <tr key={`${it.materialId}-${idx}`} className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70">
                          <td className="px-3 py-2">
                            {it.nombre || it.materialId}
                            <div className="text-xs text-slate-500 dark:text-slate-400">{it.materialId}</div>
                          </td>
                          <td className="px-3 py-2">{unidad}</td>
                          <td className="px-3 py-2 text-right">{qty}</td>
                          <td className="px-3 py-2 text-right">{centsToMoney(Number(it.precioUnitCents || 0))}</td>
                          <td className="px-3 py-2 text-right">{centsToMoney(Number(it.subtotalCents || 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {canEdit && selectedVenta.estado !== "PAGADO" && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Cuotas</div>
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                <input
                  type="number"
                  min={1}
                  value={cuotasCount}
                  className="w-24 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value || 1));
                    setCuotasCount(n);
                    splitCuotas(n);
                  }}
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => splitCuotas(cuotasCount || 1)}
                >
                  Recalcular
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Suma: {centsToMoney(totalCentsDraft)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {cuotasDraft.map((c, idx) => (
                  <div key={c.n} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                    <div className="text-xs mb-1">Cuota {c.n}</div>
                    <input
                      value={c.monto}
                      onChange={(e) =>
                        setCuotasDraft((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, monto: e.target.value } : p))
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      inputMode="decimal"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={saveCuotas}
                disabled={pendingAction}
                className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pendingAction ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Procesando...
                  </>
                ) : (
                  "Guardar cuotas"
                )}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Pagos</div>
            {cuotas.map((c) => {
              const pagado = Number(c.pagadoMontoCents || 0);
              const pendiente = Math.max(0, Number(c.montoCents || 0) - pagado);
              return (
                <div key={c.id} className="flex flex-col gap-2 rounded border border-slate-200 p-2 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm">
                    Cuota {c.n} | Monto: {centsToMoney(c.montoCents)} | Pagado: {centsToMoney(pagado)} | Pendiente: {centsToMoney(pendiente)} | Estado:{" "}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estadoBadgeClass(c.estado || (pendiente <= 0 ? "PAGADO" : "PENDIENTE"))}`}>
                      {c.estado || (pendiente <= 0 ? "PAGADO" : "PENDIENTE")}
                    </span>
                  </div>
                  {canPagar && pendiente > 0 && (
                    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                      <input
                        value={paymentInputs[String(c.n)] || ""}
                        onChange={(e) =>
                          setPaymentInputs((prev) => ({ ...prev, [String(c.n)]: e.target.value }))
                        }
                        className="w-24 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        inputMode="decimal"
                        placeholder={centsToMoney(pendiente)}
                        disabled={pendingAction}
                      />
                      <button
                        type="button"
                        onClick={() => registrarPago(c)}
                        disabled={pendingAction}
                        className="inline-flex items-center justify-center gap-2 rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {pendingAction ? (
                          <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                            Procesando...
                          </>
                        ) : (
                          "Pagar"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canAnular && (
            <button
              type="button"
              onClick={anularVenta}
              disabled={pendingAction || selectedVenta.estado === "ANULADA" || selectedVenta.estado === "PAGADO"}
              className="inline-flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pendingAction ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                  Procesando...
                </>
              ) : (
                "Anular venta (devuelve stock)"
              )}
            </button>
          )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



