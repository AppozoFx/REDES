"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  corregirOrdenAction,
  getCuadrillaPreconStockLiquidacionAction,
  liquidarOrdenAction,
  moverSnALaCuadrillaDeOrdenAction,
} from "./actions";
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
const PRECON_OPTIONS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;

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

type SnLookupInfo = {
  ok: boolean;
  sn: string;
  found: boolean;
  equipo: string;
  proid: string;
  inTargetCuadrillaStock: boolean;
  targetCuadrillaId: string;
  targetCuadrillaNombre: string;
  ubicacion: string;
  estado: string;
  isCuadrilla: boolean;
  currentCuadrillaId: string;
  currentCuadrillaNombre: string;
  isInstalado: boolean;
  cliente: string;
  codigoCliente: string;
  reason: string;
  actionHint: string;
};

function emptyStock(): StockByTipo {
  return { ONT: [], MESH: [], BOX: [], FONO: [] };
}

function emptyPreliquidacion(): PreliquidacionLite {
  return { snOnt: "", snMeshes: [], snBoxes: [], snFono: "", rotuloNapCto: "" };
}

function lookupTone(info?: SnLookupInfo | null) {
  if (!info) return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300";
  if (info.reason === "ALREADY_INSTALLED" || info.reason === "NOT_FOUND") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300";
}

// ── Shared input/button styles ──
const snInputBase = "w-full rounded-xl border px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:ring-2 dark:text-slate-100";
const snInputEmpty = "border-slate-200 bg-white focus:border-blue-400 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900";
const snInputValid = "border-emerald-400 bg-emerald-50 focus:ring-emerald-100 dark:bg-emerald-900/20";
const snInputInvalid = "border-rose-400 bg-rose-50 focus:ring-rose-100 dark:bg-rose-900/20";
const snInputDisabled = "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500";
const fieldLabel = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5";

function CopyBtn({ value, label }: { value: string; label?: string }) {
  return (
    <button
      type="button"
      disabled={!norm(value)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value || ""); toast.success(label || "Copiado"); }
        catch { toast.error("No se pudo copiar"); }
      }}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
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
  const [lookupLoading, setLookupLoading] = useState<Record<string, boolean>>({});
  const [lookupBySn, setLookupBySn] = useState<Record<string, SnLookupInfo>>({});
  const [movePendingBySn, setMovePendingBySn] = useState<Record<string, boolean>>({});
  const [ontMoveModalOpen, setOntMoveModalOpen] = useState(false);
  const [ontMoveSn, setOntMoveSn] = useState("");
  const [ontMoveLoading, setOntMoveLoading] = useState(false);
  const [ontMoveWithPrecon, setOntMoveWithPrecon] = useState(false);
  const [ontMovePreconId, setOntMovePreconId] = useState("");
  const [ontMovePreconStock, setOntMovePreconStock] = useState<Record<string, number>>({
    PRECON_50: 0,
    PRECON_100: 0,
    PRECON_150: 0,
    PRECON_200: 0,
  });
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

  const invalidLookupSns = useMemo(() => {
    const sns = new Set<string>();
    const addIfInvalid = (value: string, valid: boolean) => {
      const key = norm(value);
      if (key && !valid) sns.add(key);
    };

    addIfInvalid(snONT, validONT);
    snMESHUi.forEach((v) => addIfInvalid(v, meshSet.has(norm(v))));
    snBOXUi.forEach((v) => addIfInvalid(v, boxSet.has(norm(v))));
    addIfInvalid(snFONO, fonoSet.has(norm(snFONO)));

    return Array.from(sns);
  }, [snONT, validONT, snMESHUi, snBOXUi, snFONO, meshSet, boxSet, fonoSet]);

  async function fetchStock(signal?: AbortSignal) {
    if (!orden.cuadrillaId) {
      setStock(emptyStock());
      return;
    }
    setStockLoading(true);
    try {
      const res = await fetch(
        `/api/ordenes/liquidacion/stock?cuadrillaId=${encodeURIComponent(orden.cuadrillaId)}`,
        { cache: "no-store", signal }
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setStock(data.stock || emptyStock());
    } catch {
      setStock(emptyStock());
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!orden.cuadrillaId) return;
    const ctrl = new AbortController();
    fetchStock(ctrl.signal);
    return () => ctrl.abort();
  }, [open, orden.cuadrillaId]);

  useEffect(() => {
    if (!open) {
      setLookupBySn({});
      setLookupLoading({});
      return;
    }
    if (stockLoading) return;
    if (!orden.cuadrillaId) return;

    const needed = invalidLookupSns.filter((sn) => !!sn);
    setLookupBySn((prev) => {
      const next: Record<string, SnLookupInfo> = {};
      needed.forEach((sn) => {
        if (prev[sn]) next[sn] = prev[sn];
      });
      return next;
    });
    if (!needed.length) {
      setLookupLoading({});
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setLookupLoading(Object.fromEntries(needed.map((sn) => [sn, true])));

    async function loadLookups() {
      const entries = await Promise.all(
        needed.map(async (sn) => {
          try {
            const res = await fetch(
              `/api/ordenes/liquidacion/sn-lookup?cuadrillaId=${encodeURIComponent(orden.cuadrillaId)}&sn=${encodeURIComponent(sn)}`,
              { cache: "no-store", signal: ctrl.signal }
            );
            const data = await res.json();
            if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
            return [sn, data as SnLookupInfo] as const;
          } catch {
            return [sn, null] as const;
          }
        })
      );
      if (cancelled) return;
      setLookupBySn((prev) => {
        const next = { ...prev };
        entries.forEach(([sn, data]) => {
          if (data) next[sn] = data;
          else delete next[sn];
        });
        return next;
      });
      setLookupLoading(Object.fromEntries(needed.map((sn) => [sn, false])));
    }

    loadLookups();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open, stockLoading, orden.cuadrillaId, invalidLookupSns]);

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
    setProidONT(hit?.proid || lookupBySn[key]?.proid || "");
  }, [snONT, stock.ONT, lookupBySn]);

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

  function renderLookupHint(rawSn: string) {
    const key = norm(rawSn);
    if (!key) return null;
    if (lookupLoading[key]) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
          Consultando ubicación actual del SN…
        </div>
      );
    }
    const info = lookupBySn[key];
    if (!info) return null;

    const lines: string[] = [
      `Ubicación actual: ${info.found ? info.ubicacion || "-" : "-"}`,
      `Acción: ${info.actionHint || "Revisar ubicación real del equipo antes de liquidar."}`,
    ];

    return (
      <div className={`rounded-xl border px-3 py-2.5 text-xs ${lookupTone(info)}`}>
        {lines.map((line) => <div key={line}>{line}</div>)}
        {info.reason === "IN_OTHER_CUADRILLA" ? (
          <div className="mt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => openMoveFlow(key)}
              disabled={!!movePendingBySn[key] || ontMoveModalOpen}
            >
              {movePendingBySn[key] ? (
                <><span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-slate-600" />Moviendo…</>
              ) : (
                `Mover a ${info.targetCuadrillaNombre || "esta cuadrilla"}`
              )}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function closeOntMoveModal() {
    setOntMoveModalOpen(false);
    setOntMoveSn("");
    setOntMoveLoading(false);
    setOntMoveWithPrecon(false);
    setOntMovePreconId("");
    setOntMovePreconStock({ PRECON_50: 0, PRECON_100: 0, PRECON_150: 0, PRECON_200: 0 });
  }

  async function refreshAfterMove(sn: string) {
    await fetchStock();
    setLookupLoading((prev) => ({ ...prev, [sn]: true }));
    try {
      const res = await fetch(
        `/api/ordenes/liquidacion/sn-lookup?cuadrillaId=${encodeURIComponent(orden.cuadrillaId)}&sn=${encodeURIComponent(sn)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
      setLookupBySn((prev) => ({ ...prev, [sn]: data as SnLookupInfo }));
    } catch {
      // mantener ultimo estado conocido
    } finally {
      setLookupLoading((prev) => ({ ...prev, [sn]: false }));
    }
  }

  async function executeMove(sn: string, preconMaterialId?: string) {
    const key = norm(sn);
    if (!key) return;
    setMovePendingBySn((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await moverSnALaCuadrillaDeOrdenAction({
        ordenId: orden.id,
        sn: key,
        preconMaterialId: preconMaterialId || "",
      });
      if (!result?.ok) throw new Error("MOVE_FAIL");
      await refreshAfterMove(key);
      closeOntMoveModal();
      toast.success("Equipo movido a la cuadrilla de la orden");
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo mover el equipo"));
    } finally {
      setMovePendingBySn((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function openMoveFlow(rawSn: string) {
    const key = norm(rawSn);
    const info = lookupBySn[key];
    if (!info || info.reason !== "IN_OTHER_CUADRILLA") return;
    if (String(info.equipo || "").toUpperCase() !== "ONT") {
      await executeMove(key);
      return;
    }
    if (!info.currentCuadrillaId) {
      toast.error("No se pudo identificar la cuadrilla origen del ONT");
      return;
    }
    setOntMoveSn(key);
    setOntMoveModalOpen(true);
    setOntMoveWithPrecon(false);
    setOntMovePreconId("");
    setOntMoveLoading(true);
    try {
      const res = await getCuadrillaPreconStockLiquidacionAction({ cuadrillaId: info.currentCuadrillaId });
      if (res?.ok && res.stock) {
        setOntMovePreconStock({
          PRECON_50: Number(res.stock.PRECON_50 || 0),
          PRECON_100: Number(res.stock.PRECON_100 || 0),
          PRECON_150: Number(res.stock.PRECON_150 || 0),
          PRECON_200: Number(res.stock.PRECON_200 || 0),
        });
      }
    } catch {
      toast.error("No se pudo cargar stock PRECON de la cuadrilla origen");
      closeOntMoveModal();
    } finally {
      setOntMoveLoading(false);
    }
  }

  const ontMoveInfo = ontMoveSn ? lookupBySn[norm(ontMoveSn)] : null;
  const ontMovePreconDisponibles = useMemo(
    () => PRECON_OPTIONS.map((id) => ({ id, stock: Number(ontMovePreconStock[id] || 0) })),
    [ontMovePreconStock]
  );

  async function confirmOntMove() {
    if (!ontMoveSn) return;
    if (ontMoveWithPrecon && !ontMovePreconId) {
      toast.error("Selecciona un PRECON para mover junto al equipo ONT");
      return;
    }
    if (ontMoveWithPrecon && Number(ontMovePreconStock[ontMovePreconId] || 0) < 1) {
      toast.error("No hay stock suficiente del PRECON seleccionado en la cuadrilla origen");
      return;
    }
    await executeMove(ontMoveSn, ontMoveWithPrecon ? ontMovePreconId : "");
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

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  const isLiquidado = !!orden.liquidado && !orden.correccionPendiente;
  const isCorreccionPendiente = !!orden.correccionPendiente;

  return (
    <div
      className={`overflow-hidden rounded-2xl border text-slate-900 transition-all dark:text-slate-100 ${
        cardFocus
          ? "border-blue-400 ring-2 ring-blue-500"
          : isLiquidado
          ? "border-emerald-200 dark:border-emerald-800/60"
          : isCorreccionPendiente
          ? "border-amber-300 dark:border-amber-700/60"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {/* ── Status accent bar ── */}
      <div className={`h-1 w-full ${
        isLiquidado ? "bg-emerald-400" : isCorreccionPendiente ? "bg-amber-400" : "bg-[#30518c]"
      }`} />

      <div className={`p-4 ${isLiquidado ? "bg-emerald-50/30 dark:bg-emerald-900/5" : "bg-white dark:bg-slate-900"}`}>
        <div className="flex items-start justify-between gap-3">
          {/* ── Left: info ── */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Código + cliente */}
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                onClick={() => copyText(codigoTxt, "Código copiado")}
                title="Copiar código"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-base font-extrabold tracking-wide text-slate-900 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {orden.codiSeguiClien || orden.ordenId}
                <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              </button>
              <button
                type="button"
                onClick={() => copyText(clienteTxt, "Cliente copiado")}
                title="Copiar cliente"
                className="inline-flex rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {clienteTxt}
              </button>
            </div>

            {/* Dirección y plan */}
            <div className="space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-1.5">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span>{orden.direccion || "—"}</span>
              </div>
              <div className="flex items-start gap-1.5">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /></svg>
                <span className="break-words">{orden.plan || orden.idenServi || "—"}</span>
              </div>
            </div>

            {/* Cuadrilla + fecha */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-700/60 dark:bg-blue-900/30 dark:text-blue-300">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                {orden.cuadrillaNombre || orden.cuadrillaId}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {ymdToDmy(orden.fechaFinVisiYmd || "")}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                {orden.estado || "—"} · {orden.tipo || "—"}
              </span>
            </div>

            {/* Tramo */}
            <button
              type="button"
              onClick={() => copyText(tramoCopyText, "Resumen de tramo copiado")}
              title="Copiar resumen de tramo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {tramo}
            </button>

            {/* Tipificaciones */}
            {(tips.cableadoMesh || tips.gamer || tips.kitWifiPro) && (
              <div className="flex flex-wrap gap-1">
                {tips.cableadoMesh && <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-700/60 dark:bg-indigo-900/30 dark:text-indigo-300">CABLEADO MESH</span>}
                {tips.gamer && <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/30 dark:text-blue-300">INTERNETGAMER</span>}
                {tips.kitWifiPro && <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-300">KIT WIFI PRO</span>}
              </div>
            )}
          </div>

          {/* ── Right: actions ── */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            {isLiquidado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Liquidada
              </span>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:opacity-50"
                onClick={() => (open ? closeModal() : setOpen(true))}
                disabled={isLiquidado}
              >
                {open ? (
                  <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>Cerrar</>
                ) : isCorreccionPendiente ? (
                  <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Liquidar (corrección)</>
                ) : (
                  <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Liquidar</>
                )}
              </button>
            )}
            {orden.liquidado && (
              <>
                <form ref={corrFormRef} action={corrAction} className="inline">
                  <input type="hidden" name="ordenId" value={orden.id} />
                  <input type="hidden" name="motivo" value={corrMotivo} />
                </form>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                  disabled={corrPending}
                  onClick={() => {
                    const motivo = window.prompt("Motivo de corrección (opcional):", corrMotivo || "");
                    if (motivo === null) return;
                    setCorrMotivo(motivo || "");
                    requestAnimationFrame(() => corrFormRef.current?.requestSubmit());
                  }}
                >
                  {corrPending ? (
                    <><span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-amber-700" />Corrigiendo…</>
                  ) : (
                    <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Corregir</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Corrección pendiente banner */}
        {isCorreccionPendiente && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
            <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              Pendiente por corregir. Devuelve equipos y vuelve a liquidar con las series correctas.
              {orden.correccionYmd ? ` · Corregida: ${orden.correccionYmd.split("-").reverse().join("/")}` : ""}
              {orden.correccionBy ? ` · Por: ${orden.correccionBy}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Modal de liquidación ── */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="absolute inset-x-0 top-3 bottom-3 mx-auto w-[96vw] max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">

            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Liquidar orden — <span className="font-mono">{orden.codiSeguiClien || orden.ordenId}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{orden.cliente || "—"} · {orden.cuadrillaNombre || orden.cuadrillaId}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form action={action} className="space-y-4 p-5">
              <input type="hidden" name="ordenId" value={orden.id} />
              <input type="hidden" name="snsText" value={snsText} />
              <input type="hidden" name="rotuloNapCto" value={rotuloNapCto} />
              <input type="hidden" name="planGamer" value={planGamerChecked ? "GAMER" : ""} />
              <input type="hidden" name="kitWifiPro" value={kitWifiProChecked ? "KIT WIFI PRO (AL CONTADO)" : ""} />
              <input type="hidden" name="servicioCableadoMesh" value={cableadoMeshChecked ? "SERVICIO CABLEADO DE MESH" : ""} />
              <input type="hidden" name="cat5e" value={String(cableadoMeshChecked ? Math.max(1, Math.min(4, Math.floor(cat5e || 1))) : 0)} />
              <input type="hidden" name="cat6" value={String(cat6)} />
              <input type="hidden" name="puntosUTP" value={String(puntosUTP)} />
              <input type="hidden" name="observacion" value={observacion} />

              {/* Datos de la orden */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Datos de la orden</p>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-xs font-medium text-slate-400">Fecha</span>
                    <p className="font-medium">{ymdToDmy(orden.fechaFinVisiYmd || "")}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-400">Cuadrilla</span>
                    <p>
                      <span className="inline-flex rounded-lg bg-blue-100 px-2 py-0.5 font-semibold text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">
                        {orden.cuadrillaNombre || orden.cuadrillaId || "—"}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-400">Código cliente</span>
                    <button
                      type="button"
                      onClick={() => copyText(codigoTxt, "Código copiado")}
                      className="mt-0.5 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                    >
                      {codigoTxt}
                      <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    </button>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-400">Cliente</span>
                    <button
                      type="button"
                      onClick={() => copyText(clienteTxt, "Cliente copiado")}
                      className="mt-0.5 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                    >
                      {clienteTxt}
                      <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    </button>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-xs font-medium text-slate-400">Dirección</span>
                    <p className="font-medium">{orden.direccion || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-400">Tipo</span>
                    <p>{orden.tipo || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-400">Plan / Servicios</span>
                    <p className="whitespace-pre-line text-xs">{planLines.join("\n")}</p>
                  </div>
                </div>
              </div>

              {/* Resumen de equipos esperados */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Esperado:</span>
                {[
                  { label: "ONT", val: 1 },
                  { label: "MESH", val: meshBaseSlots },
                  { label: "FONO", val: expected.fono },
                  { label: "BOX", val: boxBaseSlots },
                ].map(({ label, val }) => (
                  <span key={label} className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono font-semibold ${val > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                    {label}:{val}
                  </span>
                ))}
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400">
                  Gamer:{tips.gamer ? "Sí" : "No"} · KitWifiPro:{tips.kitWifiPro ? "Sí" : "No"} · CableadoMesh:{tips.cableadoMesh ? "Sí" : "No"}
                </span>
              </div>

              {/* Alertas */}
              {observacionRequerida && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
                  <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  Estás usando equipos fuera del plan. La observación es obligatoria para liquidar.
                </div>
              )}
              {duplicates.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-300">
                  <svg className="h-4 w-4 shrink-0 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  SN duplicados: {duplicates.join(", ")}
                </div>
              )}

              {/* Loading states */}
              {(stockLoading || preliqLoading) && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                  {stockLoading ? "Cargando stock de cuadrilla…" : "Cargando pre-liquidación de Telegram…"}
                </div>
              )}

              {/* ── SN ONT ── */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Series de equipos</p>
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className={fieldLabel}>SN ONT <span className="text-rose-500">*</span></label>
                      <div className="flex items-center gap-2">
                        <input
                          list={`ont-list-${orden.ordenId}`}
                          value={snONT}
                          onChange={(e) => setSnONT(e.target.value)}
                          className={`${snInputBase} ${!norm(snONT) ? snInputEmpty : validONT ? snInputValid : snInputInvalid}`}
                          placeholder="Ejemplo: ONT123456"
                          required
                        />
                        <CopyBtn value={snONT} label="SN ONT copiada" />
                      </div>
                      <datalist id={`ont-list-${orden.ordenId}`}>
                        {stock.ONT.map((o) => <option key={o.sn} value={o.sn} />)}
                      </datalist>
                      <input
                        value={proidONT}
                        readOnly
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        placeholder="PROID ONT (auto)"
                      />
                      {!!norm(snONT) && !validONT && (
                        <div className="mt-1.5 space-y-1.5">
                          <p className="text-xs font-medium text-rose-600">SN no encontrado en stock de cuadrilla.</p>
                          {renderLookupHint(snONT)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SN MESH */}
                  {snMESHUi.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className={fieldLabel + " mb-0"}>SN MESH <span className="normal-case font-normal text-slate-400">({meshEnteredCount}/4 usados)</span></label>
                        <button
                          type="button"
                          className="text-xs font-medium text-[#30518c] transition hover:underline disabled:opacity-50 dark:text-blue-400"
                          onClick={() => canAddMeshExtra && setMeshExtraEnabled((v) => !v)}
                          disabled={!canAddMeshExtra}
                        >
                          {canAddMeshExtra ? (meshExtraEnabled ? "— Quitar MESH adicionales" : "+ MESH adicionales") : "Máx. 4"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {snMESHUi.map((v, i) => {
                          const prevFilled = i === 0 ? true : !!norm(snMESHUi[i - 1] || "");
                          return (
                            <div key={`mesh-${orden.ordenId}-${i}`} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  list={`mesh-list-${orden.ordenId}`}
                                  value={v}
                                  onChange={(e) => setSnMESH((prev) => updateAt(ensureArraySize(prev, snMESHUi.length), i, e.target.value))}
                                  className={`${snInputBase} ${!prevFilled ? snInputDisabled : !norm(v) ? snInputEmpty : meshSet.has(norm(v)) ? snInputValid : snInputInvalid}`}
                                  placeholder={`MESH ${i + 1}`}
                                  disabled={!prevFilled}
                                />
                                <CopyBtn value={v} label={`SN MESH ${i + 1} copiada`} />
                              </div>
                              {!!norm(v) && !meshSet.has(norm(v)) && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-rose-600">SN no encontrado en stock.</p>
                                  {renderLookupHint(v)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <datalist id={`mesh-list-${orden.ordenId}`}>
                          {stock.MESH.map((sn) => <option key={sn} value={sn} />)}
                        </datalist>
                      </div>
                      {meshExtraEnabled && !requiredFirstMeshExtra && (
                        <p className="text-xs font-medium text-amber-600">Debes completar el primer MESH adicional para continuar.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <p>MESH no requerido para esta orden.</p>
                      <button type="button" className="font-medium text-[#30518c] hover:underline dark:text-blue-400" onClick={() => setMeshExtraEnabled(true)}>
                        + Agregar MESH adicionales
                      </button>
                    </div>
                  )}

                  {/* SN BOX */}
                  {snBOXUi.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className={fieldLabel + " mb-0"}>SN BOX <span className="normal-case font-normal text-slate-400">({boxEnteredCount}/4 usados)</span></label>
                        <button
                          type="button"
                          className="text-xs font-medium text-[#30518c] transition hover:underline disabled:opacity-50 dark:text-blue-400"
                          onClick={() => canAddBoxExtra && setBoxExtraEnabled((v) => !v)}
                          disabled={!canAddBoxExtra}
                        >
                          {canAddBoxExtra ? (boxExtraEnabled ? "— Quitar BOX adicionales" : "+ BOX adicionales") : "Máx. 4"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {snBOXUi.map((v, i) => {
                          const prevFilled = i === 0 ? true : !!norm(snBOXUi[i - 1] || "");
                          return (
                            <div key={`box-${orden.ordenId}-${i}`} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <input
                                  list={`box-list-${orden.ordenId}`}
                                  value={v}
                                  onChange={(e) => setSnBOX((prev) => updateAt(ensureArraySize(prev, snBOXUi.length), i, e.target.value))}
                                  className={`${snInputBase} ${!prevFilled ? snInputDisabled : !norm(v) ? snInputEmpty : boxSet.has(norm(v)) ? snInputValid : snInputInvalid}`}
                                  placeholder={`BOX ${i + 1}`}
                                  disabled={!prevFilled}
                                />
                                <CopyBtn value={v} label={`SN BOX ${i + 1} copiada`} />
                              </div>
                              {!!norm(v) && !boxSet.has(norm(v)) && (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-rose-600">SN no encontrado en stock.</p>
                                  {renderLookupHint(v)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <datalist id={`box-list-${orden.ordenId}`}>
                          {stock.BOX.map((sn) => <option key={sn} value={sn} />)}
                        </datalist>
                      </div>
                      {boxExtraEnabled && !requiredFirstBoxExtra && (
                        <p className="text-xs font-medium text-amber-600">Debes completar el primer BOX adicional para continuar.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <p>BOX no requerido para esta orden.</p>
                      <button type="button" className="font-medium text-[#30518c] hover:underline dark:text-blue-400" onClick={() => setBoxExtraEnabled(true)}>
                        + Agregar BOX adicionales
                      </button>
                    </div>
                  )}

                  {/* SN FONO */}
                  {expected.fono > 0 || fonoExtraEnabled ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className={fieldLabel + " mb-0"}>
                          SN FONO{" "}
                          <span className={`normal-case font-normal ${expected.fono > 0 ? "text-rose-500" : "text-slate-400"}`}>
                            {expected.fono > 0 ? "(requerido)" : "(excepcional)"}
                          </span>
                        </label>
                        {expected.fono <= 0 && (
                          <button type="button" className="text-xs font-medium text-rose-500 hover:underline" onClick={() => setFonoExtraEnabled(false)}>
                            — Quitar FONO
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          list={`fono-list-${orden.ordenId}`}
                          value={snFONO}
                          onChange={(e) => setSnFONO(e.target.value)}
                          className={`${snInputBase} ${!norm(snFONO) ? snInputEmpty : fonoSet.has(norm(snFONO)) ? snInputValid : snInputInvalid}`}
                          placeholder="Ejemplo: FONO123456"
                        />
                        <CopyBtn value={snFONO} label="SN FONO copiada" />
                      </div>
                      <datalist id={`fono-list-${orden.ordenId}`}>
                        {stock.FONO.map((sn) => <option key={sn} value={sn} />)}
                      </datalist>
                      {!!norm(snFONO) && !fonoSet.has(norm(snFONO)) && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-rose-600">SN no encontrado en stock.</p>
                          {renderLookupHint(snFONO)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <p>FONO no requerido para esta orden.</p>
                      <button type="button" className="font-medium text-[#30518c] hover:underline dark:text-blue-400" onClick={() => setFonoExtraEnabled(true)}>
                        + Agregar FONO adicional
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Servicios ── */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Servicios detectados / confirmados</p>
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                      { label: "Plan Gamer", checked: planGamerChecked, onChange: (v: boolean) => setPlanGamerChecked(v) },
                      {
                        label: "Servicio Cableado de MESH",
                        checked: cableadoMeshChecked,
                        onChange: (v: boolean) => {
                          setCableadoMeshChecked(v);
                          if (v && (!Number.isFinite(cat5e) || cat5e < 1)) setCat5e(1);
                          if (!v) setCat5e(0);
                        },
                      },
                      { label: "KIT WIFI PRO (Al contado)", checked: kitWifiProChecked, onChange: (v: boolean) => setKitWifiProChecked(v) },
                    ].map(({ label, checked, onChange }) => (
                      <label key={label} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${checked ? "border-blue-200 bg-blue-50 dark:border-blue-700/60 dark:bg-blue-900/20" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#30518c] cursor-pointer" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className={fieldLabel}>CAT 5e</label>
                      <input
                        type="number" min={1} max={4} step={1}
                        value={cableadoMeshChecked ? (cat5e < 1 ? 1 : cat5e) : 0}
                        onChange={(e) => {
                          const raw = Math.floor(Number(e.target.value || 1));
                          const safe = Math.max(1, Math.min(4, Number.isFinite(raw) ? raw : 1));
                          setCat5e(safe);
                        }}
                        disabled={!cableadoMeshChecked}
                        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition dark:text-slate-100 ${!cableadoMeshChecked ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500" : "border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900"}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={fieldLabel}>CAT 6</label>
                      <input value={String(cat6)} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" />
                    </div>
                    <div className="space-y-1.5">
                      <label className={fieldLabel}>Puntos UTP</label>
                      <input value={String(puntosUTP)} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Materiales automáticos ── */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Materiales automáticos por instalación</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-100 p-0 text-xs dark:bg-slate-700/60 sm:grid-cols-4 md:grid-cols-7">
                  {["ACTA×1", "CINTILLO_30×4", "CINTILLO_BANDERA×1", "CONECTOR×1", "ACOPLADOR×1", "PACHCORD×1", "ROSETA×1"].map((m) => (
                    <div key={m} className="bg-white px-3 py-2 text-center font-mono text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">{m}</div>
                  ))}
                </div>
              </div>

              {/* ── Rótulo y observación ── */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rótulo y observación</p>
                </div>
                <div className="space-y-4 p-4">
                  <div className="space-y-1.5">
                    <label className={fieldLabel}>Rótulo NAP/CTO <span className="text-rose-500">*</span></label>
                    <input
                      value={rotuloNapCto}
                      onChange={(e) => setRotuloNapCto(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 dark:text-slate-100 ${!norm(rotuloNapCto) ? "border-rose-400 bg-rose-50 focus:ring-rose-100 dark:bg-rose-900/20" : "border-slate-200 bg-white focus:border-blue-400 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900"}`}
                      placeholder="Ejemplo: NAP-12 / CTO-45"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={fieldLabel}>
                      Observación {observacionRequerida && <span className="text-rose-500">*</span>}
                      {!observacionRequerida && <span className="normal-case font-normal text-slate-400">(opcional)</span>}
                    </label>
                    <input
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 dark:text-slate-100 ${
                        observacionRequerida && !norm(observacion)
                          ? "border-rose-400 bg-rose-50 focus:ring-rose-100 dark:bg-rose-900/20"
                          : "border-slate-200 bg-white focus:border-blue-400 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900"
                      }`}
                      placeholder={observacionRequerida ? "Obligatoria por excepción de equipos" : "Notas de liquidación…"}
                    />
                  </div>
                </div>
              </div>

              {/* ── Submit ── */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <div>
                  {state?.ok && (
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      ✓ Liquidado. Equipos: {state.resumen.equipos} · Materiales: {state.resumen.materiales}
                    </p>
                  )}
                  {state?.ok === false && (
                    <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                      {(state.error?.formErrors || []).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!canSubmitStrict || !norm(rotuloNapCto)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Procesando…</>
                  ) : (
                    <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Confirmar liquidación</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal movimiento ONT ── */}
      {ontMoveModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Mover ONT entre cuadrillas</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">El equipo ONT se moverá junto con su kit base de materiales.</p>
              </div>
              <button type="button" onClick={closeOntMoveModal} disabled={!!movePendingBySn[norm(ontMoveSn)]}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="space-y-1">
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">SN:</span> <span className="font-mono font-semibold">{ontMoveSn || "—"}</span></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Origen:</span> {ontMoveInfo?.currentCuadrillaNombre || ontMoveInfo?.ubicacion || "—"}</div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Destino:</span> {ontMoveInfo?.targetCuadrillaNombre || "—"}</div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kit ONT a mover</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {[["ACTA", "1"], ["CONECTOR", "1"], ["ROSETA", "1"], ["ACOPLADOR", "1"], ["PACHCORD", "1"], ["CINTILLO_30", "4"], ["CINTILLO_BANDERA", "1"]].map(([m, qty]) => (
                      <div key={m} className="flex items-center justify-between px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-mono">{m}</span>
                        <span className="font-semibold">{qty} UND</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={ontMoveWithPrecon} onChange={(e) => { setOntMoveWithPrecon(e.target.checked); if (!e.target.checked) setOntMovePreconId(""); }} className="h-4 w-4 accent-[#30518c] cursor-pointer" />
                    <span className="text-slate-700 dark:text-slate-200">Mover también PRECON (1 UND)</span>
                  </label>
                </div>
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {ontMovePreconDisponibles.map((it) => (
                    <label
                      key={it.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                        ontMoveWithPrecon && ontMovePreconId === it.id
                          ? "border-blue-300 bg-blue-50 dark:border-blue-700/60 dark:bg-blue-900/20"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      } ${it.stock <= 0 ? "opacity-50" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <input type="radio" name="precon_liq" disabled={!ontMoveWithPrecon || it.stock <= 0} checked={ontMoveWithPrecon && ontMovePreconId === it.id} onChange={() => setOntMovePreconId(it.id)} className="accent-[#30518c]" />
                        <span className="font-mono font-semibold text-xs">{it.id}</span>
                      </span>
                      <span className="text-xs font-medium">{ontMoveLoading ? "…" : `${it.stock} UND`}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeOntMoveModal} disabled={!!movePendingBySn[norm(ontMoveSn)]}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                  Cancelar
                </button>
                <button type="button" onClick={confirmOntMove} disabled={ontMoveLoading || !!movePendingBySn[norm(ontMoveSn)]}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_2px_8px_rgba(5,150,105,.25)] transition hover:bg-emerald-700 disabled:opacity-60">
                  {movePendingBySn[norm(ontMoveSn)] ? (
                    <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Moviendo…</>
                  ) : (
                    <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Confirmar movimiento</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
