"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { actualizarCuotasVentaAction, registrarPagoVentaAction, anularVentaAction } from "../server-actions";

type VentaDoc = {
  id: string;
  area: "INSTALACIONES" | "AVERIAS";
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
  const [areaFilter, setAreaFilter] = useState<"ALL" | "INSTALACIONES" | "AVERIAS">("ALL");
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
    setPageInfo({ hasMore: false, lastId: "", lastCreatedAtMs: 0 });
    loadVentas(true);
  }, [yearFilter, monthFilter]);

  const ventasView = useMemo(() => {
    let list = ventas;
    if (areaFilter !== "ALL") {
      list = list.filter((v: any) => String(v?.area || "") === areaFilter);
    }
    if (canViewAll && coordFilter) {
      list = list.filter((v: any) => String(v?.coordinadorUid || "") === coordFilter);
    }
    if (onlyPending) {
      list = list.filter((v: any) => String(v?.estado || "") !== "PAGADO");
    }
    return list;
  }, [ventas, areaFilter, coordFilter, onlyPending, canViewAll]);

  useEffect(() => {
    if (!canViewAll) return;
    (async () => {
      try {
        const res = await fetch("/api/usuarios/by-role?role=COORDINADOR", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setCoordinadores(Array.isArray(data?.items) ? data.items : []);
      } catch {}
    })();
  }, [canViewAll]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="text-sm">Área</label>
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value as any)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">Todas</option>
          <option value="INSTALACIONES">Instalaciones</option>
          <option value="AVERIAS">AVERIAS</option>
        </select>
        {canViewAll && (
          <>
            <label className="text-sm ml-2">Coordinador</label>
            <select
              value={coordFilter}
              onChange={(e) => setCoordFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
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
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
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
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
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
        {loading && <span className="text-xs text-slate-500">Cargando...</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
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
              <tr key={v.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono">{v.id}</td>
                <td className="px-3 py-2">{v.area}</td>
                <td className="px-3 py-2">{v.cuadrillaNombre || v.cuadrillaId}</td>
                <td className="px-3 py-2">{v.coordinadorNombre || v.coordinadorUid}</td>
                <td className="px-3 py-2">{v.cuadrillaNombre || v.cuadrillaId || "-"}</td>
                <td className="px-3 py-2">{centsToMoney(v.totalCents)}</td>
                <td className="px-3 py-2">{centsToMoney(v.saldoPendienteCents)}</td>
                <td className="px-3 py-2">{v.estado}</td>
                <td className="px-3 py-2">{v.createdAtStr || "-"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="rounded-lg border border-blue-300 px-2 py-1 text-blue-700 hover:bg-blue-50"
                    onClick={() => loadDetalle(v.id)}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
            {ventasView.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-center text-muted-foreground">
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
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}

      {selectedVenta && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Detalle venta: {selectedVenta.id}</div>
            <div className="text-sm">Estado: {selectedVenta.estado}</div>
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
              <div className="text-sm text-muted-foreground">Sin detalle de materiales.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
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
                        <tr key={`${it.materialId}-${idx}`} className="border-t border-slate-200 hover:bg-slate-50">
                          <td className="px-3 py-2">
                            {it.nombre || it.materialId}
                            <div className="text-xs text-slate-500">{it.materialId}</div>
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
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="number"
                  min={1}
                  value={cuotasCount}
                  className="w-24 rounded border px-2 py-1"
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value || 1));
                    setCuotasCount(n);
                    splitCuotas(n);
                  }}
                />
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => splitCuotas(cuotasCount || 1)}
                >
                  Recalcular
                </button>
                <span className="text-xs text-slate-500">
                  Suma: {centsToMoney(totalCentsDraft)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {cuotasDraft.map((c, idx) => (
                  <div key={c.n} className="rounded border p-2">
                    <div className="text-xs mb-1">Cuota {c.n}</div>
                    <input
                      value={c.monto}
                      onChange={(e) =>
                        setCuotasDraft((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, monto: e.target.value } : p))
                        )
                      }
                      className="w-full rounded border px-2 py-1"
                      inputMode="decimal"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={saveCuotas}
                disabled={pendingAction}
                className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Guardar cuotas
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Pagos</div>
            {cuotas.map((c) => {
              const pagado = Number(c.pagadoMontoCents || 0);
              const pendiente = Math.max(0, Number(c.montoCents || 0) - pagado);
              return (
                <div key={c.id} className="rounded border p-2 flex items-center justify-between gap-2">
                  <div className="text-sm">
                    Cuota {c.n} | Monto: {centsToMoney(c.montoCents)} | Pagado: {centsToMoney(pagado)} | Pendiente: {centsToMoney(pendiente)} | Estado: {c.estado || "-"}
                  </div>
                  {canPagar && pendiente > 0 && (
                    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <input
                        value={paymentInputs[String(c.n)] || ""}
                        onChange={(e) =>
                          setPaymentInputs((prev) => ({ ...prev, [String(c.n)]: e.target.value }))
                        }
                        className="w-24 rounded border px-2 py-1"
                        inputMode="decimal"
                        placeholder={centsToMoney(pendiente)}
                      />
                      <button
                        type="button"
                        onClick={() => registrarPago(c)}
                        disabled={pendingAction}
                        className="rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Pagar
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
              className="rounded bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Anular venta (devuelve stock)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

