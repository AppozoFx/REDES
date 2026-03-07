"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { corregirOrdenAction, liquidarOrdenAction } from "./actions";
import { resolveTramoNombre } from "@/domain/ordenes/tramo";

type OrdenLite = {
  id: string;
  ordenId: string;
  cliente: string;
  direccion: string;
  plan: string;
  codiSeguiClien: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  fechaFinVisiYmd: string;
  fechaFinVisiHm: string;
  fSoliHm?: string;
  tipo: string;
  estado: string;
  idenServi: string;
  cantMESHwin: string;
  cantFONOwin: string;
  cantBOXwin: string;
  liquidado?: boolean;
  correccionPendiente?: boolean;
  correccionBy?: string;
  correccionYmd?: string;
  rotuloNapCto?: string;
};

const norm = (s: string) => String(s || "").trim().toUpperCase();

function detectTipificaciones(idenServi: string) {
  const base = norm(idenServi);
  const compact = base.replace(/\s+/g, "");
  const gamer = compact.includes("INTERNETGAMER") || base.includes("GAMER");
  const kitWifiPro = compact.includes("KITWIFIPRO(ENVENTA)") || compact.includes("KITWIFIPRO") || base.includes("KIT WIFI PRO (EN VENTA)");
  const cableadoMesh = compact.includes("SERVICIOCABLEADODEMESH") || base.includes("CABLEADO DE MESH");
  return { gamer, kitWifiPro, cableadoMesh };
}
function ensureArraySize(arr: string[], n: number) {
  const out = [...arr];
  while (out.length < n) out.push("");
  return out.slice(0, n);
}

function splitByPipeLines(text: string) {
  return String(text || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ymdToDmy(ymd: string) {
  const s = String(ymd || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s || "-";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type StockByTipo = {
  ONT: Array<{ sn: string; proid: string }>;
  MESH: string[];
  BOX: string[];
  FONO: string[];
};

type PreliquidacionLite = {
  snOnt: string;
  snMeshes: string[];
  snBoxes: string[];
  snFono: string;
  rotuloNapCto: string;
};

function emptyStock(): StockByTipo {
  return { ONT: [], MESH: [], BOX: [], FONO: [] };
}

function emptyPreliquidacion(): PreliquidacionLite {
  return { snOnt: "", snMeshes: [], snBoxes: [], snFono: "", rotuloNapCto: "" };
}

export function LiquidacionRowClient({
  orden,
  onLiquidated,
}: {
  orden: OrdenLite;
  onLiquidated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(liquidarOrdenAction as any, null as any);
  const [corrState, corrAction, corrPending] = useActionState(corregirOrdenAction as any, null as any);
  const [corrMotivo, setCorrMotivo] = useState("");
  const corrFormRef = useRef<HTMLFormElement | null>(null);
  const tramo = resolveTramoNombre(orden.fSoliHm || "", orden.fechaFinVisiHm);
  const tips = useMemo(() => detectTipificaciones(orden.idenServi || ""), [orden.idenServi]);
  const [snONT, setSnONT] = useState("");
  const [proidONT, setProidONT] = useState("");
  const [snFONO, setSnFONO] = useState("");
  const [snMESH, setSnMESH] = useState<string[]>([]);
  const [snBOX, setSnBOX] = useState<string[]>([]);
  const [planGamerChecked, setPlanGamerChecked] = useState(false);
  const [kitWifiProChecked, setKitWifiProChecked] = useState(false);
  const [cableadoMeshChecked, setCableadoMeshChecked] = useState(false);
  const [cat5e, setCat5e] = useState(0);
  const [rotuloNapCto, setRotuloNapCto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [meshExtraEnabled, setMeshExtraEnabled] = useState(false);
  const [boxExtraEnabled, setBoxExtraEnabled] = useState(false);
  const [fonoExtraEnabled, setFonoExtraEnabled] = useState(false);
  const [stock, setStock] = useState<StockByTipo>(emptyStock());
  const [stockLoading, setStockLoading] = useState(false);
  const [preliqLoading, setPreliqLoading] = useState(false);
  const [cardFocus, setCardFocus] = useState(false);
  const [prefilledOnce, setPrefilledOnce] = useState(false);

  const expected = useMemo(() => {
    const mesh = Number(orden.cantMESHwin || 0);
    const fono = Number(orden.cantFONOwin || 0);
    const box = Number(orden.cantBOXwin || 0);
    return {
      mesh: Number.isFinite(mesh) ? mesh : 0,
      fono: Number.isFinite(fono) ? fono : 0,
      box: Number.isFinite(box) ? box : 0,
    };
  }, [orden.cantMESHwin, orden.cantFONOwin, orden.cantBOXwin]);
  const meshBaseSlots = Math.min(4, Math.max(0, expected.mesh));
  const boxBaseSlots = Math.min(4, Math.max(0, expected.box));
  const canAddMeshExtra = meshBaseSlots < 4;
  const canAddBoxExtra = boxBaseSlots < 4;
  const meshTotalSlots = meshExtraEnabled && canAddMeshExtra ? 4 : meshBaseSlots;
  const boxTotalSlots = boxExtraEnabled && canAddBoxExtra ? 4 : boxBaseSlots;
  const snMESHUi = useMemo(() => ensureArraySize(snMESH, meshTotalSlots), [snMESH, meshTotalSlots]);
  const snBOXUi = useMemo(() => ensureArraySize(snBOX, boxTotalSlots), [snBOX, boxTotalSlots]);
  const snMESHBase = useMemo(() => snMESHUi.slice(0, meshBaseSlots), [snMESHUi, meshBaseSlots]);
  const snBOXBase = useMemo(() => snBOXUi.slice(0, boxBaseSlots), [snBOXUi, boxBaseSlots]);

  const allSns = useMemo(() => {
    const list = [snONT, ...snMESHUi, ...snBOXUi, snFONO].map(norm).filter(Boolean);
    return list;
  }, [snONT, snMESHUi, snBOXUi, snFONO]);

  const duplicates = useMemo(() => {
    const m = new Map<string, number>();
    for (const sn of allSns) m.set(sn, (m.get(sn) || 0) + 1);
    return Array.from(m.entries())
      .filter(([, n]) => n > 1)
      .map(([sn]) => sn);
  }, [allSns]);

  const snsText = useMemo(() => {
    const uniq = Array.from(new Set(allSns));
    return uniq.join("\n");
  }, [allSns]);

  const canSubmit =
    !pending &&
    !!norm(snONT) &&
    duplicates.length === 0 &&
    (expected.fono > 0 ? !!norm(snFONO) : !fonoExtraEnabled || !!norm(snFONO));

  const cat6 = planGamerChecked ? 1 : 0;
  const puntosUTP = (cableadoMeshChecked ? Math.max(1, Math.min(4, Math.floor(cat5e || 1))) : 0) + cat6;

  const ontSet = useMemo(() => new Set(stock.ONT.map((o) => norm(o.sn))), [stock.ONT]);
  const meshSet = useMemo(() => new Set(stock.MESH.map((v) => norm(v))), [stock.MESH]);
  const boxSet = useMemo(() => new Set(stock.BOX.map((v) => norm(v))), [stock.BOX]);
  const fonoSet = useMemo(() => new Set(stock.FONO.map((v) => norm(v))), [stock.FONO]);

  const validONT = !!norm(snONT) && ontSet.has(norm(snONT));
  const validFONO = expected.fono <= 0 || (!!norm(snFONO) && fonoSet.has(norm(snFONO)));
  const validMESH = snMESHUi.every((v) => !norm(v) || meshSet.has(norm(v)));
  const validBOX = snBOXUi.every((v) => !norm(v) || boxSet.has(norm(v)));
  const requiredMESHComplete = meshBaseSlots <= 0 || snMESHBase.every((v) => !!norm(v));
  const requiredBOXComplete = boxBaseSlots <= 0 || snBOXBase.every((v) => !!norm(v));
  const firstExtraMeshIndex = meshBaseSlots;
  const firstExtraBoxIndex = boxBaseSlots;
  const requiredFirstMeshExtra =
    !meshExtraEnabled || !canAddMeshExtra || !!norm(snMESHUi[firstExtraMeshIndex] || "");
  const requiredFirstBoxExtra =
    !boxExtraEnabled || !canAddBoxExtra || !!norm(snBOXUi[firstExtraBoxIndex] || "");

  const meshEnteredCount = snMESHUi.filter((v) => !!norm(v)).length;
  const boxEnteredCount = snBOXUi.filter((v) => !!norm(v)).length;
  const fonoEntered = !!norm(snFONO);
  const exceptionalUsed =
    meshEnteredCount > meshBaseSlots ||
    boxEnteredCount > boxBaseSlots ||
    (expected.fono <= 0 && fonoEntered);
  const observacionRequerida = exceptionalUsed;
  const observacionValida = !observacionRequerida || !!norm(observacion);

  const canSubmitStrict =
    canSubmit &&
    validONT &&
    validFONO &&
    validMESH &&
    validBOX &&
    requiredMESHComplete &&
    requiredBOXComplete &&
    requiredFirstMeshExtra &&
    requiredFirstBoxExtra &&
    observacionValida;

  useEffect(() => {
    if (!open) return;
    if (!orden.cuadrillaId) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function loadStock() {
      setStockLoading(true);
      try {
        const res = await fetch(
          `/api/ordenes/liquidacion/stock?cuadrillaId=${encodeURIComponent(orden.cuadrillaId)}`,
          { cache: "no-store", signal: ctrl.signal }
        );
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) setStock(data.stock || emptyStock());
      } catch {
        if (!cancelled) setStock(emptyStock());
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    }

    loadStock();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open, orden.cuadrillaId]);

  useEffect(() => {
    if (!open || prefilledOnce) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function prefillFromTelegram() {
      setPlanGamerChecked(!!tips.gamer);
      setKitWifiProChecked(!!tips.kitWifiPro);
      setCableadoMeshChecked(!!tips.cableadoMesh);
      setCat5e(tips.cableadoMesh ? 1 : 0);
      if (orden.rotuloNapCto) setRotuloNapCto(orden.rotuloNapCto);

      const pedido = String(orden.codiSeguiClien || "").trim();
      const ymd = String(orden.fechaFinVisiYmd || "").trim();
      if (!pedido || !ymd) {
        if (!cancelled) setPrefilledOnce(true);
        return;
      }

      setPreliqLoading(true);
      try {
        const res = await fetch(
          `/api/ordenes/liquidacion/preliquidacion?pedido=${encodeURIComponent(pedido)}&ymd=${encodeURIComponent(ymd)}`,
          { cache: "no-store", signal: ctrl.signal }
        );
        const data = await res.json();
        if (!res.ok || !data?.ok || !data?.found) {
          if (!cancelled) setPrefilledOnce(true);
          return;
        }

        const pre = (data?.item || emptyPreliquidacion()) as PreliquidacionLite;
        if (cancelled) return;

        const meshes = Array.isArray(pre.snMeshes)
          ? pre.snMeshes.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 4)
          : [];
        const boxes = Array.isArray(pre.snBoxes)
          ? pre.snBoxes.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 4)
          : [];
        const hasMeshExtra = meshes.length > meshBaseSlots && canAddMeshExtra;
        const hasBoxExtra = boxes.length > boxBaseSlots && canAddBoxExtra;
        const hasFonoExtra = !expected.fono && !!norm(pre.snFono || "");

        setMeshExtraEnabled(hasMeshExtra);
        setBoxExtraEnabled(hasBoxExtra);
        setFonoExtraEnabled(hasFonoExtra);

        if (pre.snOnt) setSnONT(pre.snOnt);
        if (pre.snFono) setSnFONO(pre.snFono);
        if (meshes.length) setSnMESH(meshes);
        if (boxes.length) setSnBOX(boxes);
        if (pre.rotuloNapCto) setRotuloNapCto(pre.rotuloNapCto);
      } catch {
        // Ignoramos fallas de prefill para no bloquear la liquidacion manual.
      } finally {
        if (!cancelled) {
          setPreliqLoading(false);
          setPrefilledOnce(true);
        }
      }
    }

    prefillFromTelegram();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [
    open,
    prefilledOnce,
    tips.gamer,
    tips.kitWifiPro,
    tips.cableadoMesh,
    orden.rotuloNapCto,
    orden.codiSeguiClien,
    orden.fechaFinVisiYmd,
    meshBaseSlots,
    boxBaseSlots,
    canAddMeshExtra,
    canAddBoxExtra,
    expected.fono,
  ]);

  useEffect(() => {
    if (!meshExtraEnabled) setSnMESH((prev) => prev.slice(0, meshBaseSlots));
  }, [meshExtraEnabled, meshBaseSlots]);

  useEffect(() => {
    if (!boxExtraEnabled) setSnBOX((prev) => prev.slice(0, boxBaseSlots));
  }, [boxExtraEnabled, boxBaseSlots]);

  useEffect(() => {
    if (!fonoExtraEnabled && expected.fono <= 0) setSnFONO("");
  }, [fonoExtraEnabled, expected.fono]);

  useEffect(() => {
    const key = norm(snONT);
    if (!key) {
      setProidONT("");
      return;
    }
    const hit = stock.ONT.find((o) => norm(o.sn) === key);
    setProidONT(hit?.proid || "");
  }, [snONT, stock.ONT]);

  const handledOkRef = useRef(false);
  useEffect(() => {
    if (!state?.ok) {
      handledOkRef.current = false;
      return;
    }
    if (handledOkRef.current) return;
    handledOkRef.current = true;
    if (open) closeModal();
    onLiquidated?.();

    const d = state?.details;
    if (d) {
      const fechaOrden = d.fechaOrdenYmd ? d.fechaOrdenYmd.split("-").reverse().join("/") : "-";
      const ont = d.ont?.sn ? `ONT: ${d.ont.sn}${d.ont.proid ? ` (PROID ${d.ont.proid})` : ""}` : "ONT: -";
      const desc = [
        `OK ${d.cliente || "-"} - Pedido ${d.codigoCliente || "-"} (${fechaOrden})`,
        `Cuadrilla: ${d.cuadrilla || "-"}`,
        ont,
        `MESH: ${d.mesh ?? 0}`,
        `BOX: ${d.box ?? 0}`,
        `INTERNETGAMER: ${d.gamer ? "Si" : "No"}`,
        `KIT WIFI PRO: ${d.kitWifiPro ? "Si" : "No"}`,
        `Cableado MESH: ${d.cableadoMesh ? "Si" : "No"}`,
        `UTP: ${d.puntosUTP ?? 0} (Cat5e ${d.cat5e ?? 0} / Cat6 ${d.cat6 ?? 0})`,
        `Liquidado por: ${d.liquidadoPor || "-"}`,
      ].join("\n");
      toast.success("Liquidacion registrada", { description: desc, duration: 8000 });
    }
  }, [state?.ok, open]);

  const handledCorrRef = useRef(false);
  useEffect(() => {
    if (!corrState?.ok) {
      handledCorrRef.current = false;
      return;
    }
    if (handledCorrRef.current) return;
    handledCorrRef.current = true;
    const msg = `Instalacion corregida para ${corrState?.cliente || "cliente"} (${corrState?.codigoCliente || "-"})`;
    toast.success("Correccion registrada", { description: msg, duration: 6000 });
    onLiquidated?.();
  }, [corrState?.ok]);

  const closeModal = () => {
    setOpen(false);
    setCardFocus(true);
    window.setTimeout(() => setCardFocus(false), 1600);
  };

  const copyText = async (value: string, ok = "Copiado") => {
    try {
      await navigator.clipboard.writeText(value || "");
      toast.success(ok);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  function updateAt(arr: string[], idx: number, value: string) {
    const next = [...arr];
    next[idx] = value;
    return next;
  }

  const codigoTxt = useMemo(() => orden.codiSeguiClien || orden.ordenId || "-", [orden.codiSeguiClien, orden.ordenId]);
  const clienteTxt = useMemo(() => orden.cliente || "-", [orden.cliente]);

  const planLines = useMemo(() => {
    const base = orden.plan || orden.idenServi || "-";
    const lines = splitByPipeLines(base);
    return lines.length ? lines : ["-"];
  }, [orden.plan, orden.idenServi]);

  const tramoCopyText = useMemo(() => {
    const fecha = ymdToDmy(orden.fechaFinVisiYmd || "");
    const codigo = orden.codiSeguiClien || orden.ordenId || "-";
    const cliente = orden.cliente || "-";
    const cuadrilla = orden.cuadrillaNombre || orden.cuadrillaId || "-";
    return [`*${fecha}*`, codigo, `*${cliente}*`, `Cuadrilla *${cuadrilla}*`, `*${tramo}*`].join("\n");
  }, [orden.fechaFinVisiYmd, orden.codiSeguiClien, orden.ordenId, orden.cliente, orden.cuadrillaNombre, orden.cuadrillaId, tramo]);

  return (
    <div className={`rounded-xl border border-slate-200 p-4 space-y-3 text-slate-900 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${cardFocus ? "ring-2 ring-blue-500 border-blue-400 bg-blue-50/40 dark:bg-blue-900/20" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <button
            type="button"
            className="text-left rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-lg font-extrabold tracking-wide text-slate-900 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={async () => {
              copyText(codigoTxt, "Codigo copiado");
            }}
            title="Copiar codigo"
          >
            {orden.codiSeguiClien || orden.ordenId}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-left text-sm rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={async () => {
                copyText(clienteTxt, "Cliente copiado");
              }}
              title="Copiar cliente"
            >
              <span className="text-slate-700 dark:text-slate-100">{clienteTxt}</span>
            </button>
          </div>
          <div className="text-sm break-words text-slate-600 dark:text-slate-300">
            Direccion: {orden.direccion || "-"}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Plan: {orden.plan || orden.idenServi || "-"}
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
            <span className="font-medium">Cuadrilla</span>
            <span className="font-semibold">{orden.cuadrillaNombre || orden.cuadrillaId}</span>
            <span className="text-blue-700 dark:text-blue-300">|</span>
            <span>{ymdToDmy(orden.fechaFinVisiYmd || "")}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Estado: {orden.estado || "-"} | Tipo: {orden.tipo || "-"}
          </div>
          <div>
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={async () => {
                await copyText(tramoCopyText, "Resumen de tramo copiado");
              }}
              title="Copiar resumen de tramo"
            >
              {tramo}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {tips.cableadoMesh ? <span className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">SERVICIO CABLEADO DE MESH</span> : null}
            {tips.gamer ? <span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">INTERNETGAMER</span> : null}
            {tips.kitWifiPro ? <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">KIT WIFI PRO (EN VENTA)</span> : null}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
        <button
          type="button"
          className="rounded-lg border bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          onClick={() => (open ? closeModal() : setOpen(true))}
          disabled={!!orden.liquidado && !orden.correccionPendiente}
        >
          {open ? "Cerrar" : orden.correccionPendiente ? "Liquidar (correccion)" : "Liquidar"}
        </button>
        {orden.liquidado ? (
          <>
            <form ref={corrFormRef} action={corrAction} className="inline">
              <input type="hidden" name="ordenId" value={orden.id} />
              <input type="hidden" name="motivo" value={corrMotivo} />
            </form>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm border-amber-400 text-amber-700"
              disabled={corrPending}
              onClick={() => {
                const motivo = window.prompt("Motivo de correccion (opcional):", corrMotivo || "");
                if (motivo === null) return;
                setCorrMotivo(motivo || "");
                requestAnimationFrame(() => corrFormRef.current?.requestSubmit());
              }}
            >
              {corrPending ? "Corrigiendo..." : "Corregir"}
            </button>
          </>
        ) : null}
        </div>
      </div>
      {orden.correccionPendiente || orden.correccionYmd ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          Pendiente por corregir. Devuelve equipos y vuelve a liquidar con las series correctas.
          {orden.correccionYmd ? ` Corregida: ${orden.correccionYmd.split("-").reverse().join("/")}` : ""}
          {orden.correccionBy ? ` | Por: ${orden.correccionBy}` : ""}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/45" onClick={closeModal} />
	            <div className="absolute inset-x-0 top-4 bottom-4 mx-auto w-[96vw] max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-base">Liquidar orden {orden.codiSeguiClien || orden.ordenId}</div>
	              <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-200" onClick={closeModal}>
	                Cerrar
	              </button>
            </div>
            <form action={action} className="space-y-3">
          <input type="hidden" name="ordenId" value={orden.id} />
          <input type="hidden" name="snsText" value={snsText} />
          <input type="hidden" name="rotuloNapCto" value={rotuloNapCto} />
          <input type="hidden" name="planGamer" value={planGamerChecked ? "GAMER" : ""} />
          <input type="hidden" name="kitWifiPro" value={kitWifiProChecked ? "KIT WIFI PRO (AL CONTADO)" : ""} />
          <input type="hidden" name="servicioCableadoMesh" value={cableadoMeshChecked ? "SERVICIO CABLEADO DE MESH" : ""} />
          <input
            type="hidden"
            name="cat5e"
            value={String(cableadoMeshChecked ? Math.max(1, Math.min(4, Math.floor(cat5e || 1))) : 0)}
          />
          <input type="hidden" name="cat6" value={String(cat6)} />
          <input type="hidden" name="puntosUTP" value={String(puntosUTP)} />
          <input type="hidden" name="observacion" value={observacion} />

          <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-sm font-medium">Datos de la orden</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Fecha:</span>{" "}
                <span>{ymdToDmy(orden.fechaFinVisiYmd || "")}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Cuadrilla:</span>{" "}
                <span className="inline-flex rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">
                  {orden.cuadrillaNombre || orden.cuadrillaId || "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Codigo Cliente:</span>{" "}
                <button
                  type="button"
                  className="rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(codigoTxt);
                      toast.success("Codigo copiado");
                    } catch {
                      toast.error("No se pudo copiar codigo");
                    }
                  }}
                  title="Copiar codigo cliente"
                >
                  {orden.codiSeguiClien || orden.ordenId || "-"}
                </button>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Cliente:</span>{" "}
                <button
                  type="button"
                  className="rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(clienteTxt);
                      toast.success("Cliente copiado");
                    } catch {
                      toast.error("No se pudo copiar cliente");
                    }
                  }}
                  title="Copiar cliente"
                >
                  {orden.cliente || "-"}
                </button>
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-500 dark:text-slate-400">Direccion:</span>{" "}
                <span>{orden.direccion || "-"}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Tipo:</span>{" "}
                <span>{orden.tipo || "-"}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Plan:</span>{" "}
                <span className="block whitespace-pre-line">{planLines.join("\n")}</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Esperado por orden: ONT=1, MESH={meshBaseSlots}, FONO={expected.fono}, BOX={boxBaseSlots}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Tipificaciones: Gamer={tips.gamer ? "Si" : "No"} | Kit Wifi Pro={tips.kitWifiPro ? "Si" : "No"} | Cableado Mesh={tips.cableadoMesh ? "Si" : "No"}
          </div>
          {observacionRequerida ? (
            <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
              Estas usando equipos fuera del plan. La observacion es obligatoria para liquidar.
            </div>
          ) : null}

          {duplicates.length > 0 ? (
            <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
              SN duplicados: {duplicates.join(", ")}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">SN ONT (obligatorio)</label>
              <div className="flex items-center gap-2">
                <input
                  list={`ont-list-${orden.ordenId}`}
                  value={snONT}
                  onChange={(e) => setSnONT(e.target.value)}
                  className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                    !norm(snONT)
                      ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      : validONT
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-red-500 bg-red-50 dark:bg-red-900/20"
                  }`}
                  placeholder="Ejemplo: ONT123456"
                  required
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-2 text-xs dark:border-slate-700 dark:text-slate-200"
                  onClick={() => copyText(snONT, "SN ONT copiada")}
                  disabled={!norm(snONT)}
                  title="Copiar SN ONT"
                >
                  Copiar
                </button>
              </div>
              <datalist id={`ont-list-${orden.ordenId}`}>
                {stock.ONT.map((o) => (
                  <option key={o.sn} value={o.sn} />
                ))}
              </datalist>
              <input
                value={proidONT}
                readOnly
                className="mt-2 w-full rounded border border-slate-300 bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                placeholder="PROID ONT"
              />
              {!!norm(snONT) && !validONT ? (
                <div className="text-xs text-red-700">SN no encontrado en stock de cuadrilla.</div>
              ) : null}
            </div>
          </div>

          {snMESHUi.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">SN MESH</label>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  usados: {meshEnteredCount}/4
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  onClick={() => canAddMeshExtra && setMeshExtraEnabled((v) => !v)}
                  disabled={!canAddMeshExtra}
                >
                  {canAddMeshExtra
                    ? meshExtraEnabled
                      ? "Quitar MESH adicionales"
                      : "Agregar MESH adicionales"
                    : "Maximo MESH: 4"}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {snMESHUi.map((v, i) => (
                  <div key={`mesh-${orden.ordenId}-${i}`} className="space-y-1">
                    {(() => {
                      const prevFilled = i === 0 ? true : !!norm(snMESHUi[i - 1] || "");
                      return (
                    <div className="flex items-center gap-2">
                      <input
                        list={`mesh-list-${orden.ordenId}`}
                        value={v}
                        onChange={(e) => setSnMESH((prev) => updateAt(ensureArraySize(prev, snMESHUi.length), i, e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                          !prevFilled
                            ? "cursor-not-allowed border-slate-300 bg-gray-100 text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            : !norm(v)
                            ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                            : meshSet.has(norm(v))
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-red-500 bg-red-50 dark:bg-red-900/20"
                        }`}
                        placeholder={`MESH ${i + 1}`}
                        disabled={!prevFilled}
                      />
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-2 text-xs dark:border-slate-700 dark:text-slate-200"
                        onClick={() => copyText(v, `SN MESH ${i + 1} copiada`)}
                        disabled={!norm(v)}
                        title={`Copiar SN MESH ${i + 1}`}
                      >
                        Copiar
                      </button>
                    </div>
                      );
                    })()}
                    {!!norm(v) && !meshSet.has(norm(v)) ? (
                      <div className="text-xs text-red-700">SN no encontrado en stock de cuadrilla.</div>
                    ) : null}
                  </div>
                ))}
                <datalist id={`mesh-list-${orden.ordenId}`}>
                  {stock.MESH.map((sn) => (
                    <option key={sn} value={sn} />
                  ))}
                </datalist>
              </div>
              {meshExtraEnabled && !requiredFirstMeshExtra ? (
                <div className="text-xs text-amber-700">Debes completar el primer MESH adicional para continuar.</div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div>MESH no requerido para esta orden.</div>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:text-slate-200"
                onClick={() => setMeshExtraEnabled(true)}
              >
                Agregar MESH adicionales
              </button>
            </div>
          )}

          {snBOXUi.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">SN BOX</label>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  usados: {boxEnteredCount}/4
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                  onClick={() => canAddBoxExtra && setBoxExtraEnabled((v) => !v)}
                  disabled={!canAddBoxExtra}
                >
                  {canAddBoxExtra
                    ? boxExtraEnabled
                      ? "Quitar BOX adicionales"
                      : "Agregar BOX adicionales"
                    : "Maximo BOX: 4"}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {snBOXUi.map((v, i) => (
                  <div key={`box-${orden.ordenId}-${i}`} className="space-y-1">
                    {(() => {
                      const prevFilled = i === 0 ? true : !!norm(snBOXUi[i - 1] || "");
                      return (
                    <div className="flex items-center gap-2">
                      <input
                        list={`box-list-${orden.ordenId}`}
                        value={v}
                        onChange={(e) => setSnBOX((prev) => updateAt(ensureArraySize(prev, snBOXUi.length), i, e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                          !prevFilled
                            ? "cursor-not-allowed border-slate-300 bg-gray-100 text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                            : !norm(v)
                            ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                            : boxSet.has(norm(v))
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-red-500 bg-red-50 dark:bg-red-900/20"
                        }`}
                        placeholder={`BOX ${i + 1}`}
                        disabled={!prevFilled}
                      />
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-2 text-xs dark:border-slate-700 dark:text-slate-200"
                        onClick={() => copyText(v, `SN BOX ${i + 1} copiada`)}
                        disabled={!norm(v)}
                        title={`Copiar SN BOX ${i + 1}`}
                      >
                        Copiar
                      </button>
                    </div>
                      );
                    })()}
                    {!!norm(v) && !boxSet.has(norm(v)) ? (
                      <div className="text-xs text-red-700">SN no encontrado en stock de cuadrilla.</div>
                    ) : null}
                  </div>
                ))}
                <datalist id={`box-list-${orden.ordenId}`}>
                  {stock.BOX.map((sn) => (
                    <option key={sn} value={sn} />
                  ))}
                </datalist>
              </div>
              {boxExtraEnabled && !requiredFirstBoxExtra ? (
                <div className="text-xs text-amber-700">Debes completar el primer BOX adicional para continuar.</div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div>BOX no requerido para esta orden.</div>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:text-slate-200"
                onClick={() => setBoxExtraEnabled(true)}
              >
                Agregar BOX adicionales
              </button>
            </div>
          )}

          {expected.fono > 0 || fonoExtraEnabled ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">
                  SN FONO {expected.fono > 0 ? "(requerido)" : "(excepcional)"}
                </label>
                {expected.fono <= 0 ? (
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:text-slate-200"
                    onClick={() => setFonoExtraEnabled(false)}
                  >
                    Quitar FONO adicionales
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  list={`fono-list-${orden.ordenId}`}
                  value={snFONO}
                  onChange={(e) => setSnFONO(e.target.value)}
                  className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                    !norm(snFONO)
                      ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                      : fonoSet.has(norm(snFONO))
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-red-500 bg-red-50 dark:bg-red-900/20"
                  }`}
                  placeholder="Ejemplo: FONO123456"
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-2 text-xs dark:border-slate-700 dark:text-slate-200"
                  onClick={() => copyText(snFONO, "SN FONO copiada")}
                  disabled={!norm(snFONO)}
                  title="Copiar SN FONO"
                >
                  Copiar
                </button>
              </div>
              <datalist id={`fono-list-${orden.ordenId}`}>
                {stock.FONO.map((sn) => (
                  <option key={sn} value={sn} />
                ))}
              </datalist>
              {!!norm(snFONO) && !fonoSet.has(norm(snFONO)) ? (
                <div className="text-xs text-red-700">SN no encontrado en stock de cuadrilla.</div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div>FONO no requerido para esta orden.</div>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:text-slate-200"
                onClick={() => setFonoExtraEnabled(true)}
              >
                Agregar FONO adicionales
              </button>
            </div>
          )}

          {stockLoading ? <div className="text-xs text-slate-500 dark:text-slate-400">Cargando stock de cuadrilla...</div> : null}
          {preliqLoading ? <div className="text-xs text-slate-500 dark:text-slate-400">Cargando pre-liquidacion Telegram...</div> : null}

          <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <label className="text-sm font-medium">Materiales (consumo automatico por instalacion)</label>
            <div className="text-xs text-slate-700 dark:text-slate-200">
              ACTA:1, CINTILLO_30:4, CINTILLO_BANDERA:1, CONECTOR:1, ACOPLADOR:1, PACHCORD:1, ROSETA:1
            </div>
          </div>

            <div className="rounded border border-slate-200 p-3 space-y-3 dark:border-slate-700">
            <div className="text-sm font-medium">Servicios detectados / confirmados</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={planGamerChecked}
                  onChange={(e) => setPlanGamerChecked(e.target.checked)}
                />
                Plan Gamer
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cableadoMeshChecked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCableadoMeshChecked(checked);
                    if (checked && (!Number.isFinite(cat5e) || cat5e < 1)) setCat5e(1);
                    if (!checked) setCat5e(0);
                  }}
                />
                SERVICIO CABLEADO DE MESH
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kitWifiProChecked}
                  onChange={(e) => setKitWifiProChecked(e.target.checked)}
                />
                KIT WIFI PRO (AL CONTADO)
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">CAT 5e</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  step={1}
                  value={cableadoMeshChecked ? (cat5e < 1 ? 1 : cat5e) : 0}
                  onChange={(e) => {
                    const raw = Math.floor(Number(e.target.value || 1));
                    const safe = Math.max(1, Math.min(4, Number.isFinite(raw) ? raw : 1));
                    setCat5e(safe);
                  }}
                  disabled={!cableadoMeshChecked}
                  className={`w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${!cableadoMeshChecked ? "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400" : ""}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">CAT 6</label>
                <input
                  value={String(cat6)}
                  readOnly
                  className="w-full rounded border border-slate-300 bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Puntos UTP</label>
                <input
                  value={String(puntosUTP)}
                  readOnly
                  className="w-full rounded border border-slate-300 bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Rotulo NAP/CTO (obligatorio)</label>
            <input
              value={rotuloNapCto}
              onChange={(e) => setRotuloNapCto(e.target.value)}
              className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                !norm(rotuloNapCto)
                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
              }`}
              placeholder="Ejemplo: NAP-12 / CTO-45"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Observacion (opcional)
            </label>
            <input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className={`w-full rounded border px-3 py-2 text-sm text-slate-900 dark:text-slate-100 ${
                observacionRequerida && !norm(observacion)
                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
              }`}
              placeholder={observacionRequerida ? "Observacion obligatoria por excepcion" : "Notas de liquidacion"}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={!canSubmitStrict || !norm(rotuloNapCto)}
            >
              {pending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                  Procesando...
                </>
              ) : (
                "Confirmar liquidacion"
              )}
            </button>
            {state?.ok ? (
              <div className="text-xs text-emerald-700">
                Liquidado. Equipos: {state.resumen.equipos}, Materiales: {state.resumen.materiales}
              </div>
            ) : null}
            {state?.ok === false ? (
              <div className="text-xs text-red-700">{(state.error?.formErrors || []).join(", ")}</div>
            ) : null}
          </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

