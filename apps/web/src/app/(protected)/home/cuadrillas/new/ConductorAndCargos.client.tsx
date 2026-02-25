"use client";
import * as React from "react";

export default function ConductorAndCargos({
  tecnicos,
  coordinadores,
  gestores,
}: {
  tecnicos: { uid: string; label: string }[];
  coordinadores: { uid: string; label: string }[];
  gestores: { uid: string; label: string }[];
}) {
  const [tecs, setTecs] = React.useState<string[]>([]);
  const [conductor, setConductor] = React.useState<string>("");
  const conductorOpts = tecnicos.filter((t) => tecs.includes(t.uid));

  React.useEffect(() => {
    const sel = document.querySelector('select[name="tecnicosUids"]') as HTMLSelectElement | null;
    if (!sel) return;
    const sync = () => {
      const vals = Array.from(sel.selectedOptions).map((o) => o.value);
      setTecs(vals);
      if (!vals.includes(conductor)) setConductor(vals[0] ?? "");
    };
    sync();
    sel.addEventListener("change", sync);
    return () => sel.removeEventListener("change", sync);
  }, [conductor]);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm">Conductor</label>
        <select
          name="conductorUid"
          className="ui-select"
          value={conductor}
          onChange={(e) => setConductor(e.target.value)}
        >
          {conductorOpts.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm">Coordinador</label>
        <select name="coordinadorUid" className="ui-select-inline ui-select-inline ui-select">
          {coordinadores.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm">Gestor</label>
        <select name="gestorUid" className="ui-select-inline ui-select-inline ui-select">
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


