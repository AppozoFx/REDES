"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useState, startTransition } from "react";
import { toast } from "sonner";
import { devolverInstalacionesAction } from "../../server-actions";

const MATS_INST = [
  "PRECON_50",
  "PRECON_100",
  "PRECON_150",
  "PRECON_200",
  "ACTA",
  "BOBINA",
  "BOBINA(CONDOMINIO)",
  "CONECTOR",
  "ROSETA",
  "ACOPLADOR",
  "PACHCORD",
  "CINTILLO_30",
  "CINTILLO_10",
  "CINTILLO_BANDERA",
  "CINTA_AISLANTE",
  "TEMPLADOR",
  "ANCLAJE_P",
  "TARUGO_P",
  "CLEVI",
  "HEBILLA_1_2",
  "CINTA_BANDI_1_2",
  "CAJA_GRAPAS",
];

export default function DevolucionesClient() {
  const [step, setStep] = useState<1 | 2>(1);
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [segmento, setSegmento] = useState<"RESIDENCIAL" | "CONDOMINIO">("RESIDENCIAL");
  const [infoLoaded, setInfoLoaded] = useState(false);
  const [equiposText, setEquiposText] = useState("");
  const [bobinaCodesText, setBobinaCodesText] = useState(""); // códigos WIN-XXXX a devolver
  const [bobinaCondominioMetros, setBobinaCondominioMetros] = useState<string>("300");
  const [matUnd, setMatUnd] = useState<Record<string, string>>({});
  const [matMetros, setMatMetros] = useState<Record<string, string>>({});

  const [result, run, pending] = useActionState(devolverInstalacionesAction as any, null as any);
  const [lastPayload, setLastPayload] = useState<any>(null);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      const r: any = result;
      toast.success("Devolución generada", { description: `Guía: ${r.guia}` });
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error en devolución";
      toast.error(msg);
    }
  }, [result]);

  const equipos = useMemo(() => {
    const lines = equiposText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(lines));
  }, [equiposText]);

  function submit() {
    const materiales: any[] = [];
    for (const id of MATS_INST) {
      if (id === "BOBINA") continue;
      if (id === "BOBINA(CONDOMINIO)") continue;
      const und = Number(matUnd[id] || 0);
      const m = Number(String(matMetros[id] || "").replace(",", ".")) || 0;
      if (und > 0) materiales.push({ materialId: id, und });
      else if (m > 0) materiales.push({ materialId: id, metros: m });
    }
    if (segmento === "RESIDENCIAL") {
      const codes = bobinaCodesText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const payload = {
        cuadrillaId,
        equipos,
        materiales,
        bobinasResidenciales: codes.map((codigo) => ({ codigo })),
      };
      setLastPayload({ ...payload, segmento });
      startTransition(() => (run as any)(payload));
    } else {
      const m = Number(String(bobinaCondominioMetros || "").replace(",", ".")) || 0;
      if (m > 0) materiales.push({ materialId: "BOBINA(CONDOMINIO)", metros: m });
      const payload = { cuadrillaId, equipos, materiales };
      setLastPayload({ ...payload, segmento });
      startTransition(() => (run as any)(payload));
    }
  }

  return (
    <div className="space-y-4">
      {step === 1 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Cuadrilla ID</label>
              <input value={cuadrillaId} onChange={(e) => setCuadrillaId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Segmento</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value as any)} className="mt-1 w-full rounded border px-2 py-1">
                <option value="RESIDENCIAL">RESIDENCIAL</option>
                <option value="CONDOMINIO">CONDOMINIO</option>
              </select>
            </div>
          </div>
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              disabled={!cuadrillaId}
              onClick={async () => {
                try {
                  const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(cuadrillaId)}`);
                  const data = await res.json();
                  if (data?.ok) {
                    setSegmento((data.segmento || "RESIDENCIAL").toUpperCase());
                    setInfoLoaded(true);
                  } else {
                    // no-op
                  }
                } catch {}
              }}
              className="rounded border px-3 py-2 hover:bg-muted"
            >
              Cargar info cuadrilla
            </button>
            <button disabled={!cuadrillaId} onClick={() => setStep(2)} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">Siguiente</button>
          </div>

          {/* Printable area */}
          {result?.ok && (
            <div id="print-area" className="hidden print:block">
              <div>
                <div>Guía: {(result as any).guia}</div>
                <div>Cuadrilla: {cuadrillaId} · Segmento: {segmento}</div>
                <div>Fecha: {new Date().toLocaleString()}</div>
              </div>
              <div className="mt-2">
                <div className="font-medium">Equipos</div>
                {(lastPayload?.equipos || []).map((sn: string) => (
                  <div key={sn} className="text-xs">{sn}</div>
                ))}
              </div>
              <div className="mt-2">
                <div className="font-medium">Materiales</div>
                {(lastPayload?.materiales || []).map((m: any, idx: number) => (
                  <div key={idx} className="text-xs">{m.materialId}: {m.und || m.metros}</div>
                ))}
                {segmento === "RESIDENCIAL" && (lastPayload?.bobinasResidenciales || []).length > 0 && (
                  <div className="text-xs">Bobinas: {(lastPayload?.bobinasResidenciales || []).map((b: any) => b.codigo).join(", ")}</div>
                )}
              </div>
            </div>
          )}

          <style jsx global>{`
            @media print {
              body * { visibility: hidden; }
              #print-area, #print-area * { visibility: visible; }
              #print-area { position: absolute; left: 0; top: 0; width: 80mm; padding: 8px; }
            }
          `}</style>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded border p-3 text-sm">
            <div className="font-medium">Cuadrilla</div>
            <div>ID: {cuadrillaId} · Segmento: {segmento}</div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Equipos (SN)</div>
            <textarea value={equiposText} onChange={(e) => setEquiposText(e.target.value)} placeholder="Escanea o pega un SN por línea" className="w-full rounded border px-2 py-1 h-32 font-mono" />
            <div className="text-xs text-muted-foreground">Total únicos: {equipos.length}</div>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Materiales (INSTALACIONES)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {MATS_INST.map((id) => (
                <div key={id} className="rounded border p-2">
                  <div className="text-sm font-medium">{id}</div>
                  {id === "BOBINA" && segmento === "RESIDENCIAL" ? (
                    <div className="mt-1 text-xs text-muted-foreground">Ingresar códigos (uno por línea) a devolver.</div>
                  ) : id === "BOBINA(CONDOMINIO)" && segmento === "CONDOMINIO" ? (
                    <div className="mt-2">
                      <label className="block text-xs">Metros</label>
                      <input value={bobinaCondominioMetros} onChange={(e) => setBobinaCondominioMetros(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block">UND</label>
                        <input value={matUnd[id] || ""} onChange={(e) => setMatUnd((p) => ({ ...p, [id]: e.target.value }))} className="mt-1 w-full rounded border px-2 py-1" inputMode="numeric" />
                      </div>
                      <div>
                        <label className="block">Metros</label>
                        <input value={matMetros[id] || ""} onChange={(e) => setMatMetros((p) => ({ ...p, [id]: e.target.value }))} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {segmento === "RESIDENCIAL" && (
              <div className="space-y-1">
                <div className="font-medium">Bobinas (RESIDENCIAL) - Códigos WIN-XXXX</div>
                <textarea value={bobinaCodesText} onChange={(e) => setBobinaCodesText(e.target.value)} placeholder="WIN-1234\nWIN-5678" className="w-full rounded border px-2 py-1 h-24 font-mono" />
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-2 items-center">
            <button disabled={pending || !cuadrillaId} onClick={submit} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
              {pending ? "Procesando..." : "Confirmar devolución"}
            </button>
            {result?.ok && (
              <button type="button" onClick={() => window.print()} className="rounded border px-3 py-2 hover:bg-muted">Imprimir guía</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
