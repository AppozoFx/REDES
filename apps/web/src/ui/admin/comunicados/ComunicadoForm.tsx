"use client";

import { useMemo, useState } from "react";

type Target = "ALL" | "ROLES" | "AREAS" | "USERS";
type Estado = "ACTIVO" | "INACTIVO";
type Persistencia = "ONCE" | "ALWAYS";

type RoleItem = { id: string; nombre?: string };

type Props = {
  mode: "create" | "edit";
  defaultValues?: Partial<{
    titulo: string;
    cuerpo: string;
    imageUrl: string;
    linkUrl: string;
    linkLabel: string;

    estado: Estado;
    target: Target;

    rolesTarget: string[];
    areasTarget: string[];
    uidsTarget: string[];

    visibleDesde: string; // YYYY-MM-DD
    visibleHasta: string; // YYYY-MM-DD
    prioridad: number;
    obligatorio: boolean;

    persistencia: Persistencia;
  }>;

  rolesCatalog: RoleItem[];
  areasCatalog: string[];

  backHref: string;
  headerTitle: string;
  headerSubtitle?: string;

  showToggle?: boolean;
  currentEstado?: Estado;
  onToggleEstado?: () => void;
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export default function ComunicadoForm({
  mode,
  defaultValues,
  rolesCatalog,
  areasCatalog,
  backHref,
  headerTitle,
  headerSubtitle,
  showToggle,
  currentEstado,
  onToggleEstado,
}: Props) {
  const [target, setTarget] = useState<Target>((defaultValues?.target as Target) ?? "ALL");

  const [titulo, setTitulo] = useState(defaultValues?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(defaultValues?.cuerpo ?? "");

  const [imageUrl, setImageUrl] = useState(defaultValues?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(defaultValues?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(defaultValues?.linkLabel ?? "");

  const [rolesTarget, setRolesTarget] = useState<string[]>(defaultValues?.rolesTarget ?? []);
  const [areasTarget, setAreasTarget] = useState<string[]>(defaultValues?.areasTarget ?? []);
  const [uidsText, setUidsText] = useState((defaultValues?.uidsTarget ?? []).join(","));

  const [estado, setEstado] = useState<Estado>((defaultValues?.estado as Estado) ?? "ACTIVO");

  const [persistencia, setPersistencia] = useState<Persistencia>(
    (defaultValues?.persistencia as Persistencia) ?? "ONCE"
  );

  // inputs type="date" SIEMPRE deben recibir YYYY-MM-DD o ""
  const [visibleDesde, setVisibleDesde] = useState(defaultValues?.visibleDesde ?? "");
  const [visibleHasta, setVisibleHasta] = useState(defaultValues?.visibleHasta ?? "");

  const [prioridad, setPrioridad] = useState<number>(defaultValues?.prioridad ?? 100);
  const [obligatorio, setObligatorio] = useState<boolean>(!!defaultValues?.obligatorio);

  const uidsTarget = useMemo(
    () =>
      uniq(
        uidsText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      ),
    [uidsText]
  );

  const canShowTargetsHelp = useMemo(() => {
    if (target === "ALL") return "Se mostrará a todos los usuarios (según fechas/estado).";
    if (target === "ROLES") return "Solo usuarios que tengan AL MENOS uno de los roles seleccionados.";
    if (target === "AREAS") return "Solo usuarios que tengan AL MENOS una de las áreas seleccionadas.";
    return "Solo los usuarios cuyos UID estén listados.";
  }, [target]);

  // hidden CSV fields
  const rolesCsv = rolesTarget.join(",");
  const areasCsv = areasTarget.join(",");
  const uidsCsv = uidsTarget.join(",");

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{headerTitle}</h1>
          {headerSubtitle ? <p className="text-sm text-muted-foreground">{headerSubtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          <a className="rounded-lg border px-3 py-2 text-sm" href={backHref}>
            Volver
          </a>

          {showToggle && onToggleEstado ? (
            <button
              type="button"
              onClick={onToggleEstado}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {currentEstado === "ACTIVO" ? "Desactivar" : "Activar"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT */}
        <div className="rounded-xl border p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <input
              name="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Ej: Cambio de horario por feriado"
              required
              minLength={3}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">Corto y claro. Máx 120 caracteres.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mensaje</label>
            <textarea
              name="cuerpo"
              rows={7}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Escribe el comunicado aquí..."
              required
              minLength={1}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <select
                name="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value as Estado)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Destino</label>
              <select
                name="target"
                value={target}
                onChange={(e) => setTarget(e.target.value as Target)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="ALL">Todos</option>
                <option value="ROLES">Por roles</option>
                <option value="AREAS">Por áreas</option>
                <option value="USERS">Por usuarios (UID)</option>
              </select>
              <p className="text-xs text-muted-foreground">{canShowTargetsHelp}</p>
            </div>
          </div>

          {/* Persistencia */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Persistencia</label>
            <select
              name="persistencia"
              value={persistencia}
              onChange={(e) => setPersistencia(e.target.value as Persistencia)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="ONCE">ONCE (si lo leyó, ya no vuelve a salir)</option>
              <option value="ALWAYS">ALWAYS (siempre visible)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Recomendación: para recordatorios permanentes usa ALWAYS.
            </p>
          </div>

          {/* Targets */}
          {target === "ROLES" ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Roles objetivo</label>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setRolesTarget(rolesCatalog.map((r) => r.id))}
                >
                  Seleccionar todo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {rolesCatalog.map((r) => {
                  const checked = rolesTarget.includes(r.id);
                  return (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setRolesTarget((prev) =>
                            on ? uniq([...prev, r.id]) : prev.filter((x) => x !== r.id)
                          );
                        }}
                      />
                      <span>{r.nombre ?? r.id}</span>
                      <span className="text-xs text-muted-foreground">({r.id})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {target === "AREAS" ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Áreas objetivo</label>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setAreasTarget([...areasCatalog])}
                >
                  Seleccionar todo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {areasCatalog.map((a) => {
                  const checked = areasTarget.includes(a);
                  return (
                    <label key={a} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setAreasTarget((prev) =>
                            on ? uniq([...prev, a]) : prev.filter((x) => x !== a)
                          );
                        }}
                      />
                      <span>{a}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {target === "USERS" ? (
            <div className="space-y-2 rounded-lg border p-3">
              <label className="text-sm font-medium">UIDs objetivo</label>
              <input
                value={uidsText}
                onChange={(e) => setUidsText(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="uid1, uid2, uid3"
              />
            </div>
          ) : null}

          {/* Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Visible desde</label>
              <input
                name="visibleDesde"
                type="date"
                value={visibleDesde}
                onChange={(e) => setVisibleDesde(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">Opcional.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Visible hasta</label>
              <input
                name="visibleHasta"
                type="date"
                value={visibleHasta}
                onChange={(e) => setVisibleHasta(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">Opcional.</p>
            </div>
          </div>

          {/* Prioridad + Obligatorio */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridad</label>
              <input
                name="prioridad"
                type="number"
                value={prioridad}
                onChange={(e) => setPrioridad(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">Menor = aparece primero</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Obligatorio</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="obligatorio"
                  checked={obligatorio}
                  onChange={(e) => setObligatorio(e.target.checked)}
                />
                Bloquea /home hasta marcar “leído”
              </label>
            </div>
          </div>

          {/* Link e imagen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Link (opcional)</label>
              <input
                name="linkUrl"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Texto del link</label>
              <input
                name="linkLabel"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Ej: Ver detalle"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Imagen (opcional)</label>
            <input
              name="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          {/* Hidden CSV */}
          <input type="hidden" name="rolesTarget" value={rolesCsv} />
          <input type="hidden" name="areasTarget" value={areasCsv} />
          <input type="hidden" name="uidsTarget" value={uidsCsv} />
        </div>

        {/* RIGHT */}
        <div className="rounded-xl border p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Vista previa</h2>
            <p className="text-xs text-muted-foreground">Así lo verá el usuario.</p>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{titulo || "(Sin título)"}</div>
              <div className="flex gap-2">
                {obligatorio ? (
                  <span className="text-xs rounded-md border px-2 py-0.5">Obligatorio</span>
                ) : null}
                <span className="text-xs rounded-md border px-2 py-0.5">{persistencia}</span>
              </div>
            </div>

            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full rounded-lg border object-cover max-h-56" />
            ) : null}

            <div className="text-sm whitespace-pre-wrap">{cuerpo || "(Sin mensaje)"}</div>

            {linkUrl ? (
              <a className="text-sm underline" href={linkUrl}>
                {linkLabel || "Abrir enlace"}
              </a>
            ) : null}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div><span className="font-medium">Estado:</span> {estado}</div>
            <div><span className="font-medium">Destino:</span> {target}</div>
            <div><span className="font-medium">Prioridad:</span> {prioridad}</div>
            <div><span className="font-medium">Ventana:</span> {visibleDesde || "—"} → {visibleHasta || "—"}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="rounded-lg border px-4 py-2 text-sm" type="submit">
          {mode === "create" ? "Crear comunicado" : "Guardar cambios"}
        </button>
        <a className="rounded-lg border px-4 py-2 text-sm" href={backHref}>
          Cancelar
        </a>
      </div>
    </div>
  );
}
