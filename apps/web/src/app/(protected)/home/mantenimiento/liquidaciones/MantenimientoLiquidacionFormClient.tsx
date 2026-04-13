"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ComponentType, useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.MapContainer })), { ssr: false }) as ComponentType<any>;
const TileLayer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.TileLayer })), { ssr: false }) as ComponentType<any>;
const Marker = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Marker })), { ssr: false }) as ComponentType<any>;
const Popup = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Popup })), { ssr: false }) as ComponentType<any>;

type Cuadrilla = { id: string; nombre?: string };
type Material = { id: string; nombre?: string; unidadTipo?: "UND" | "METROS" | null };
type StockItem = { id: string; nombre?: string; cantidad?: number; metros?: number; tipo?: string };

type FormItem = {
  materialId: string;
  descripcion: string;
  unidadTipo: "UND" | "METROS";
  und: string;
  metros: string;
};

type FormState = {
  ticketNumero: string;
  ticketVisita: number;
  codigoCaja: string;
  fechaAtencionYmd: string;
  distrito: string;
  latitud: string;
  longitud: string;
  cuadrillaId: string;
  horaInicio: string;
  horaFin: string;
  causaRaiz: string;
  solucion: string;
  observacion: string;
  estado: string;
  origen: "MANUAL" | "TELEGRAM" | "IMPORTADO";
  materialesConsumidos: FormItem[];
};

type TicketPreview = {
  previousCount: number;
  nextVisita: number;
  items: Array<{
    id: string;
    ticketVisita: number;
    fechaAtencionYmd: string;
    cuadrillaNombre: string;
    estado: string;
  }>;
};

const LIMA_DISTRITOS = [
  "ANCON",
  "ATE",
  "BARRANCO",
  "BRENA",
  "CALLAO",
  "CARABAYLLO",
  "CHACLACAYO",
  "CHORRILLOS",
  "CIENEGUILLA",
  "COMAS",
  "EL AGUSTINO",
  "INDEPENDENCIA",
  "JESUS MARIA",
  "LA MOLINA",
  "LA VICTORIA",
  "LIMA",
  "LINCE",
  "LOS OLIVOS",
  "LURIGANCHO",
  "LURIN",
  "MAGDALENA DEL MAR",
  "MIRAFLORES",
  "PACHACAMAC",
  "PUCUSANA",
  "PUEBLO LIBRE",
  "PUENTE PIEDRA",
  "PUNTA HERMOSA",
  "PUNTA NEGRA",
  "RIMAC",
  "SAN BARTOLO",
  "SAN BORJA",
  "SAN ISIDRO",
  "SAN JUAN DE LURIGANCHO",
  "SAN JUAN DE MIRAFLORES",
  "SAN LUIS",
  "SAN MARTIN DE PORRES",
  "SAN MIGUEL",
  "SANTA ANITA",
  "SANTA MARIA DEL MAR",
  "SANTA ROSA",
  "SANTIAGO DE SURCO",
  "SURQUILLO",
  "VENTANILLA",
  "VILLA EL SALVADOR",
  "VILLA MARIA DEL TRIUNFO",
];

const emptyState: FormState = {
  ticketNumero: "",
  ticketVisita: 1,
  codigoCaja: "",
  fechaAtencionYmd: new Date().toISOString().slice(0, 10),
  distrito: "",
  latitud: "",
  longitud: "",
  cuadrillaId: "",
  horaInicio: "",
  horaFin: "",
  causaRaiz: "",
  solucion: "",
  observacion: "",
  estado: "ABIERTO",
  origen: "MANUAL",
  materialesConsumidos: [],
};

const circleIcon = (leaflet: any, color: string) =>
  new leaflet.DivIcon({
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });

export default function MantenimientoLiquidacionFormClient({
  mode,
  id,
}: {
  mode: "create" | "edit";
  id?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyState);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [causasRaiz, setCausasRaiz] = useState<Array<{ id: string; nombre: string }>>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [liquidating, setLiquidating] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ticketPreview, setTicketPreview] = useState<TicketPreview | null>(null);
  const [ticketPreviewLoading, setTicketPreviewLoading] = useState(false);
  const [coordenadasInput, setCoordenadasInput] = useState("");
  const [leaflet, setLeaflet] = useState<any | null>(null);

  const locked = (form.estado === "LIQUIDADO" && !correctionMode) || liquidating || correcting;

  function parseCoordenadas(value: string) {
    const clean = String(value || "").trim();
    if (!clean) return { ok: true as const, latitud: "", longitud: "" };
    const parts = clean.split(",").map((x) => x.trim());
    if (parts.length !== 2) return { ok: false as const };
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false as const };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false as const };
    return { ok: true as const, latitud: String(lat), longitud: String(lng) };
  }

  useEffect(() => {
    (async () => {
      try {
        const [cRes, mRes] = await Promise.all([
          fetch("/api/cuadrillas/list?area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/materiales/list?area=MANTENIMIENTO", { cache: "no-store" }),
        ]);
        const causasRes = await fetch("/api/mantenimiento/causas-raiz/list", { cache: "no-store" });
        const [cBody, mBody, causasBody] = await Promise.all([
          cRes.json().catch(() => ({})),
          mRes.json().catch(() => ({})),
          causasRes.json().catch(() => ({})),
        ]);
        if (cRes.ok && cBody?.ok) setCuadrillas(Array.isArray(cBody.items) ? cBody.items : []);
        if (mRes.ok && mBody?.ok) setMateriales(Array.isArray(mBody.items) ? mBody.items : []);
        if (causasRes.ok && causasBody?.ok) setCausasRaiz(Array.isArray(causasBody.items) ? causasBody.items : []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    import("leaflet")
      .then((m: any) => {
        if (!mounted) return;
        setLeaflet(m?.default || m);
      })
      .catch(() => setLeaflet(null));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/mantenimiento/liquidaciones/detail?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        const item = body.item || {};
        if (!cancelled) {
          setForm({
            ticketNumero: String(item.ticketNumero || ""),
            ticketVisita: Math.max(1, Number(item.ticketVisita || 1)),
            codigoCaja: String(item.codigoCaja || ""),
            fechaAtencionYmd: String(item.fechaAtencionYmd || ""),
            distrito: String(item.distrito || ""),
            latitud: item.latitud === null || item.latitud === undefined ? "" : String(item.latitud),
            longitud: item.longitud === null || item.longitud === undefined ? "" : String(item.longitud),
            cuadrillaId: String(item.cuadrillaId || ""),
            horaInicio: String(item.horaInicio || ""),
            horaFin: String(item.horaFin || ""),
            causaRaiz: String(item.causaRaiz || ""),
            solucion: String(item.solucion || ""),
            observacion: String(item.observacion || ""),
            estado: String(item.estado || "ABIERTO"),
            origen: (String(item.origen || "MANUAL") as any) || "MANUAL",
            materialesConsumidos: Array.isArray(item.materialesConsumidos)
              ? item.materialesConsumidos.map((it: any) => ({
                  materialId: String(it.materialId || ""),
                  descripcion: String(it.descripcion || ""),
                  unidadTipo: String(it.unidadTipo || "UND").toUpperCase() === "METROS" ? "METROS" : "UND",
                  und: String(it.und || ""),
                  metros: String(it.metros || ""),
                }))
              : [],
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || "ERROR"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, id]);

  useEffect(() => {
    if (!form.cuadrillaId) {
      setStock([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mantenimiento/cuadrillas/stock-materiales?cuadrillaId=${encodeURIComponent(form.cuadrillaId)}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error();
        if (!cancelled) setStock(Array.isArray(body.materiales) ? body.materiales : []);
      } catch {
        if (!cancelled) setStock([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.cuadrillaId]);

  useEffect(() => {
    if (!form.latitud || !form.longitud) {
      setCoordenadasInput("");
      return;
    }
    setCoordenadasInput(`${form.latitud}, ${form.longitud}`);
  }, [form.latitud, form.longitud]);

  useEffect(() => {
    const ticketNumero = String(form.ticketNumero || "").trim();
    if (!ticketNumero) {
      setTicketPreview(null);
      setTicketPreviewLoading(false);
      return;
    }

    const ctrl = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setTicketPreviewLoading(true);
        const qs = new URLSearchParams({ ticketNumero });
        if (mode === "edit" && id) qs.set("currentId", id);
        const res = await fetch(`/api/mantenimiento/liquidaciones/ticket-preview?${qs.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        setTicketPreview(body.preview || null);
      } catch (e: any) {
        if (ctrl.signal.aborted) return;
        setTicketPreview(null);
      } finally {
        if (!ctrl.signal.aborted) setTicketPreviewLoading(false);
      }
    }, 250);

    return () => {
      ctrl.abort();
      window.clearTimeout(timeout);
    };
  }, [form.ticketNumero, mode, id]);

  const stockByMaterial = useMemo(() => {
    const map = new Map<string, StockItem>();
    for (const it of stock) map.set(String(it.id || ""), it);
    return map;
  }, [stock]);

  const coordenadasPreview = useMemo(() => {
    const parsed = parseCoordenadas(coordenadasInput);
    if (!parsed.ok || !parsed.latitud || !parsed.longitud) return null;
    const lat = Number(parsed.latitud);
    const lng = Number(parsed.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      linkUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    };
  }, [coordenadasInput]);

  const materialesDisponibles = useMemo(() => {
    if (!form.cuadrillaId) return [];
    return stock
      .filter((it) => {
        const unidad = String(it.tipo || "UND").toUpperCase();
        return unidad === "METROS" ? Number(it.metros || 0) > 0 : Number(it.cantidad || 0) > 0;
      })
      .map((it) => {
        const catalogo = materiales.find((m) => m.id === it.id);
        return {
          id: it.id,
          nombre: String(it.nombre || catalogo?.nombre || it.id),
          unidadTipo: (String(it.tipo || catalogo?.unidadTipo || "UND").toUpperCase() === "METROS" ? "METROS" : "UND") as "UND" | "METROS",
          stockLabel:
            String(it.tipo || catalogo?.unidadTipo || "UND").toUpperCase() === "METROS"
              ? `${Number(it.metros || 0)} m`
              : `${Number(it.cantidad || 0)} und`,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [form.cuadrillaId, stock, materiales]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((curr) => ({ ...curr, [key]: value }));
  }

  function normalizeDistrito(value: string) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trimStart();
  }

  function mapFormError(errorValue: unknown) {
    const raw = String(errorValue || "ERROR");
    if (raw.includes("cuadrillaId") || raw === "CUADRILLA_REQUIRED") {
      return "Debes seleccionar una cuadrilla.";
    }
    if (raw.includes("fechaAtencionYmd") || raw === "FECHA_REQUIRED") {
      return "Debes ingresar la fecha de atencion.";
    }
    if (raw.includes("ticketNumero") || raw === "TICKET_REQUIRED") {
      return "Debes ingresar el numero de ticket.";
    }
    if (raw === "COORDENADAS_INVALIDAS") {
      return "Las coordenadas deben tener el formato latitud, longitud.";
    }
    return raw;
  }

  function addMaterial() {
    const materialId = String(selectedMaterialId || "").trim();
    if (!materialId) return;
    const mat = materialesDisponibles.find((m) => m.id === materialId);
    if (!mat) return;
    if (form.materialesConsumidos.some((it) => it.materialId === materialId)) return;
    patch("materialesConsumidos", [
      ...form.materialesConsumidos,
      {
        materialId,
        descripcion: String(mat.nombre || ""),
        unidadTipo: mat.unidadTipo,
        und: "",
        metros: "",
      },
    ]);
    setSelectedMaterialId("");
  }

  function updateItem(materialId: string, patchItem: Partial<FormItem>) {
    patch(
      "materialesConsumidos",
      form.materialesConsumidos.map((it) => (it.materialId === materialId ? { ...it, ...patchItem } : it))
    );
  }

  function removeItem(materialId: string) {
    patch("materialesConsumidos", form.materialesConsumidos.filter((it) => it.materialId !== materialId));
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!String(form.ticketNumero || "").trim()) throw new Error("TICKET_REQUIRED");
      if (!String(form.fechaAtencionYmd || "").trim()) throw new Error("FECHA_REQUIRED");
      if (!String(form.cuadrillaId || "").trim()) throw new Error("CUADRILLA_REQUIRED");
      const coords = parseCoordenadas(coordenadasInput);
      if (!coords.ok) throw new Error("COORDENADAS_INVALIDAS");
      const payload = {
        ...form,
        latitud: coords.latitud ? Number(coords.latitud) : null,
        longitud: coords.longitud ? Number(coords.longitud) : null,
        materialesConsumidos: form.materialesConsumidos.map((it) => ({
          materialId: it.materialId,
          descripcion: it.descripcion,
          unidadTipo: it.unidadTipo,
          und: Number(it.und || 0),
          metros: Number(it.metros || 0),
        })),
      };
      const endpoint = mode === "create" ? "/api/mantenimiento/liquidaciones/create" : "/api/mantenimiento/liquidaciones/update";
      const body = mode === "create" ? payload : { id, ...payload };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      if (mode === "create") {
        router.push(`/home/mantenimiento/liquidaciones/${data.id}`);
        router.refresh();
        return;
      }
      setMessage("Cambios guardados.");
      router.refresh();
    } catch (e: any) {
      setError(mapFormError(e?.message || "ERROR"));
    } finally {
      setSaving(false);
    }
  }

  async function liquidar() {
    if (!id) return;
    setLiquidating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mantenimiento/liquidaciones/liquidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setMessage("Liquidacion confirmada.");
      patch("estado", "LIQUIDADO");
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message || "ERROR"));
    } finally {
      setLiquidating(false);
    }
  }

  async function corregir() {
    if (!id) return;
    setCorrecting(true);
    setError("");
    setMessage("");
    try {
      if (!String(form.ticketNumero || "").trim()) throw new Error("TICKET_REQUIRED");
      if (!String(form.fechaAtencionYmd || "").trim()) throw new Error("FECHA_REQUIRED");
      if (!String(form.cuadrillaId || "").trim()) throw new Error("CUADRILLA_REQUIRED");
      const coords = parseCoordenadas(coordenadasInput);
      if (!coords.ok) throw new Error("COORDENADAS_INVALIDAS");
      const res = await fetch("/api/mantenimiento/liquidaciones/corregir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ...form,
          latitud: coords.latitud ? Number(coords.latitud) : null,
          longitud: coords.longitud ? Number(coords.longitud) : null,
          materialesConsumidos: form.materialesConsumidos.map((it) => ({
            materialId: it.materialId,
            descripcion: it.descripcion,
            unidadTipo: it.unidadTipo,
            und: Number(it.und || 0),
            metros: Number(it.metros || 0),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setCorrectionMode(false);
      setMessage("Correccion aplicada.");
      router.refresh();
    } catch (e: any) {
      setError(mapFormError(e?.message || "ERROR"));
    } finally {
      setCorrecting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#f7f9fc] via-white to-[#eef6f1] shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-7">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-600 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
              Ticket operativo
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {mode === "create" ? "Nueva liquidacion" : form.ticketNumero || "Detalle de liquidacion"}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {mode === "create"
                  ? "Crea una atencion del ticket y completa materiales cuando corresponda."
                  : "Controla la atencion, valida el stock de cuadrilla y confirma o corrige la liquidacion."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
              Estado actual: <span className="font-semibold">{form.estado || "-"}</span>
            </div>
            {mode === "edit" ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                Visita: <span className="font-semibold">#{Math.max(1, Number(form.ticketVisita || 1))}</span>
              </div>
            ) : null}
            {mode === "edit" && form.estado === "LIQUIDADO" ? (
              <button
                type="button"
                onClick={() => setCorrectionMode((v) => !v)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  correctionMode ? "bg-amber-600 text-white hover:bg-amber-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {correctionMode ? "Salir de correccion" : "Corregir liquidacion"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Link
          href="/home/mantenimiento/liquidaciones"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span aria-hidden>{"<-"}</span>
          Volver a tickets
        </Link>
        {mode === "edit" ? <div className="text-sm text-slate-500">{correctionMode ? "Modo correccion activo" : "Solo lectura si ya fue liquidado"}</div> : null}
      </div>

      {loading ? <div className="text-sm text-slate-500">Cargando...</div> : null}
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      {saving ? <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-700">Guardando ticket, espera un momento...</div> : null}

      {!loading ? (
        <>
          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Ticket <span className="text-red-500">*</span></label>
                <input value={form.ticketNumero} onChange={(e) => patch("ticketNumero", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                {ticketPreviewLoading ? (
                  <p className="mt-1 text-xs text-slate-500">Consultando historial del ticket...</p>
                ) : null}
                {!ticketPreviewLoading && ticketPreview ? (
                  ticketPreview.previousCount > 0 ? (
                    <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      <div className="font-medium">
                        Este ticket ya tiene {ticketPreview.previousCount} visita{ticketPreview.previousCount === 1 ? "" : "s"} registrada{ticketPreview.previousCount === 1 ? "" : "s"}.
                        {mode === "create" ? ` Se creara como visita #${ticketPreview.nextVisita}.` : ` Esta atencion queda como visita #${ticketPreview.nextVisita}.`}
                      </div>
                      {ticketPreview.items.length ? (
                        <div className="mt-1">
                          Historial reciente:{" "}
                          {ticketPreview.items
                            .map((it) => `#${it.ticketVisita} ${it.fechaAtencionYmd || "-"} ${it.cuadrillaNombre || "-"} ${it.estado || "-"}`)
                            .join(" | ")}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-emerald-700">No hay visitas previas. Se creara como visita #1.</p>
                  )
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Codigo caja</label>
                <input value={form.codigoCaja} onChange={(e) => patch("codigoCaja", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Causa raiz</label>
                <select value={form.causaRaiz} onChange={(e) => patch("causaRaiz", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="">Selecciona una causa raiz...</option>
                  {causasRaiz.map((causa) => (
                    <option key={causa.id} value={causa.nombre}>
                      {causa.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Fecha <span className="text-red-500">*</span></label>
                <input type="date" value={form.fechaAtencionYmd} onChange={(e) => patch("fechaAtencionYmd", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Cuadrilla <span className="text-red-500">*</span></label>
                <select value={form.cuadrillaId} onChange={(e) => patch("cuadrillaId", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="">Selecciona...</option>
                  {cuadrillas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre || c.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Coordenadas</label>
                <input
                  value={coordenadasInput}
                  onChange={(e) => setCoordenadasInput(e.target.value)}
                  disabled={locked}
                  placeholder="-11.939415, -77.042307"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">Opcional. Usa el formato latitud, longitud en una sola linea.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Distrito</label>
                <input
                  list="lima-distritos"
                  value={form.distrito}
                  onChange={(e) => patch("distrito", normalizeDistrito(e.target.value))}
                  disabled={locked}
                  placeholder="Escribe o selecciona un distrito"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm uppercase dark:border-slate-700 dark:bg-slate-900"
                />
                <datalist id="lima-distritos">
                  {LIMA_DISTRITOS.map((distrito) => (
                    <option key={distrito} value={distrito} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-slate-500">Catalogo de distritos de Lima y Callao en formato uniforme para filtros y dashboards.</p>
              </div>
              {coordenadasPreview ? (
                <div className="md:col-span-2 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vista previa de ubicacion</h3>
                      <p className="text-xs text-slate-500">
                        {coordenadasPreview.lat}, {coordenadasPreview.lng}
                      </p>
                    </div>
                    <a
                      href={coordenadasPreview.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Abrir mapa
                    </a>
                  </div>
                  <div className="h-[280px] w-full">
                    <MapContainer
                      key={`${coordenadasPreview.lat}-${coordenadasPreview.lng}`}
                      center={[coordenadasPreview.lat, coordenadasPreview.lng]}
                      zoom={16}
                      scrollWheelZoom
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        attribution="&copy; OSM, &copy; CARTO"
                      />
                      <Marker
                        position={[coordenadasPreview.lat, coordenadasPreview.lng]}
                        icon={leaflet ? circleIcon(leaflet, "#1d4ed8") : undefined}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">Ubicacion del ticket</div>
                            <div>
                              {coordenadasPreview.lat}, {coordenadasPreview.lng}
                            </div>
                            {form.distrito ? <div>Distrito: {form.distrito}</div> : null}
                          </div>
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Hora inicio</label>
                <input type="time" value={form.horaInicio} onChange={(e) => patch("horaInicio", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Hora fin</label>
                <input type="time" value={form.horaFin} onChange={(e) => patch("horaFin", e.target.value)} disabled={locked} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Solucion</label>
                <textarea value={form.solucion} onChange={(e) => patch("solucion", e.target.value)} disabled={locked} rows={4} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Observacion</label>
                <textarea value={form.observacion} onChange={(e) => patch("observacion", e.target.value)} disabled={locked} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div className="min-w-72 flex-1">
                <label className="mb-1 block text-xs text-slate-500">Agregar material</label>
                <select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)} disabled={locked || !form.cuadrillaId} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <option value="">{form.cuadrillaId ? "Selecciona un material del stock..." : "Primero selecciona una cuadrilla..."}</option>
                  {materialesDisponibles.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} - {m.nombre || m.id} ({m.unidadTipo}) | Stock: {m.stockLabel}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={addMaterial} disabled={locked || !selectedMaterialId} className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
                Agregar
              </button>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr className="text-left">
                    <th className="p-2">Material</th>
                    <th className="p-2">Unidad</th>
                    <th className="p-2">Cantidad</th>
                    <th className="p-2">Stock cuadrilla</th>
                    <th className="p-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {form.materialesConsumidos.map((it) => {
                    const stockItem = stockByMaterial.get(it.materialId);
                    const stockText =
                      it.unidadTipo === "METROS"
                        ? String(stockItem?.metros ?? 0)
                        : String(stockItem?.cantidad ?? 0);
                    return (
                      <tr key={it.materialId} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{it.materialId}</div>
                          <div className="text-xs text-slate-500">{it.descripcion || "-"}</div>
                        </td>
                        <td className="p-2">{it.unidadTipo}</td>
                        <td className="p-2">
                          {it.unidadTipo === "METROS" ? (
                            <input value={it.metros} onChange={(e) => updateItem(it.materialId, { metros: e.target.value })} disabled={locked} className="w-28 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900" />
                          ) : (
                            <input value={it.und} onChange={(e) => updateItem(it.materialId, { und: e.target.value.replace(/\D/g, "") })} disabled={locked} className="w-28 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900" />
                          )}
                        </td>
                        <td className="p-2">{stockText}</td>
                        <td className="p-2">
                          <button type="button" onClick={() => removeItem(it.materialId)} disabled={locked} className="text-red-600 hover:underline disabled:opacity-50">
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!form.materialesConsumidos.length ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500">Sin materiales agregados.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-500">Campos obligatorios: Ticket, Fecha y Cuadrilla.</div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {mode === "create" || form.estado !== "LIQUIDADO" ? (
              <button
                type="button"
                onClick={save}
                disabled={saving || locked}
                className="rounded-xl bg-[#1f5f4a] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#184c3a] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {saving ? "Guardando..." : mode === "create" ? "Crear borrador" : "Guardar cambios"}
              </button>
            ) : null}
            {mode === "edit" && form.estado !== "LIQUIDADO" ? (
              <button
                type="button"
                onClick={liquidar}
                disabled={locked || saving || !form.materialesConsumidos.length}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {liquidating ? "Liquidando..." : "Confirmar liquidacion"}
              </button>
            ) : null}
            {mode === "edit" && correctionMode ? (
              <button
                type="button"
                onClick={corregir}
                disabled={correcting || !form.materialesConsumidos.length}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
              >
                {correcting ? "Corrigiendo..." : "Aplicar correccion"}
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-start pt-2">
            <Link
              href="/home/mantenimiento/liquidaciones"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span aria-hidden>{"<-"}</span>
              Volver a tickets
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
