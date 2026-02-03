"use client";
import * as React from "react";

export default function ConductorAndCargosEdit({
  tecnicos,
  tecnicosSelected,
  coordinadores,
  gestores,
  current,
}: {
  tecnicos: { uid: string; label: string }[];
  tecnicosSelected: string[];
  coordinadores: { uid: string; label: string }[];
  gestores: { uid: string; label: string }[];
  current: { conductorUid: string; coordinadorUid: string; gestorUid: string };
}) {
  const [tecs, setTecs] = React.useState<string[]>(tecnicosSelected ?? []);
  const [conductor, setConductor] = React.useState<string>(current.conductorUid ?? "");
  const conductorOpts = tecnicos.filter((t) => tecs.includes(t.uid));

  React.useEffect(() => {
    const sel = document.querySelector('select[name="tecnicosUids"]') as HTMLSelectElement | null;
    if (!sel) return;
    const onChange = () => {
      const vals = Array.from(sel.selectedOptions).map((o) => o.value);
      setTecs(vals);
      if (!vals.includes(conductor)) setConductor(vals[0] ?? "");
    };
    onChange();
    sel.addEventListener("change", onChange);
    return () => sel.removeEventListener("change", onChange);
  }, [conductor]);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm">Conductor</label>
        <select name="conductorUid" className="w-full border rounded px-3 py-2" value={conductor} onChange={(e) => setConductor(e.target.value)}>
          {conductorOpts.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm">Coordinador</label>
        <select name="coordinadorUid" className="w-full border rounded px-3 py-2" defaultValue={current.coordinadorUid}>
          {coordinadores.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm">Gestor</label>
        <select name="gestorUid" className="w-full border rounded px-3 py-2" defaultValue={current.gestorUid}>
          {gestores.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

