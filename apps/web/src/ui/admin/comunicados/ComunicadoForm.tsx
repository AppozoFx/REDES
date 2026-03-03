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
    visibleDesde: string;
    visibleHasta: string;
    prioridad: number;
    obligatorio: boolean;
    persistencia: Persistencia;
  }>;
  rolesCatalog: RoleItem[];
  areasCatalog: string[];
  backHref: string;
  headerTitle: string;
  headerSubtitle?: string;
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function getTargetHelp(target: Target) {
  if (target === "ROLES") return "Solo para usuarios con alguno de los roles seleccionados.";
  if (target === "AREAS") return "Solo para usuarios con alguna de las areas seleccionadas.";
  if (target === "USERS") return "Solo para los UID especificos separados por coma.";
  return "Visible para todos los usuarios habilitados.";
}

export default function ComunicadoForm({
  mode,
  defaultValues,
  rolesCatalog,
  areasCatalog,
  backHref,
  headerTitle,
  headerSubtitle,
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

  const rolesCsv = rolesTarget.join(",");
  const areasCsv = areasTarget.join(",");
  const uidsCsv = uidsTarget.join(",");
  const targetHelp = getTargetHelp(target);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight">{headerTitle}</h1>
        {headerSubtitle ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{headerSubtitle}</p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Contenido</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Puedes combinar texto, imagen y enlace en el mismo comunicado.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Titulo</label>
                <input
                  name="titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="ui-input"
                  placeholder="Ej: Nuevo procedimiento de instalaciones"
                  required
                  minLength={3}
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mensaje</label>
                <textarea
                  name="cuerpo"
                  rows={7}
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Escribe aqui el comunicado..."
                  required
                  minLength={1}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Multimedia y enlace</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">URL de imagen (opcional)</label>
                <input
                  name="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="ui-input"
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL de enlace (opcional)</label>
                <input
                  name="linkUrl"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="ui-input"
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Texto del enlace</label>
                <input
                  name="linkLabel"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  className="ui-input"
                  placeholder="Ej: Ver documento"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Segmentacion</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Destino</label>
                <select
                  name="target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as Target)}
                  className="ui-select"
                >
                  <option value="ALL">Todos</option>
                  <option value="ROLES">Por roles</option>
                  <option value="AREAS">Por areas</option>
                  <option value="USERS">Por usuarios</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Persistencia</label>
                <select
                  name="persistencia"
                  value={persistencia}
                  onChange={(e) => setPersistencia(e.target.value as Persistencia)}
                  className="ui-select"
                >
                  <option value="ONCE">ONCE (si lo leen, deja de mostrarse)</option>
                  <option value="ALWAYS">ALWAYS (siempre visible)</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{targetHelp}</p>

            {target === "ROLES" ? (
              <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Roles objetivo</span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setRolesTarget(rolesCatalog.map((r) => r.id))}
                  >
                    Seleccionar todo
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {target === "AREAS" ? (
              <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Areas objetivo</span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setAreasTarget([...areasCatalog])}
                  >
                    Seleccionar todo
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
              <div className="mt-3 space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <label className="text-sm font-medium">UIDs objetivo</label>
                <input
                  value={uidsText}
                  onChange={(e) => setUidsText(e.target.value)}
                  className="ui-input"
                  placeholder="uid1, uid2, uid3"
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Configuracion</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Estado</label>
                <select
                  name="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as Estado)}
                  className="ui-select"
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Prioridad</label>
                <input
                  name="prioridad"
                  type="number"
                  value={prioridad}
                  onChange={(e) => setPrioridad(Number(e.target.value))}
                  className="ui-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Visible desde</label>
                <input
                  name="visibleDesde"
                  type="date"
                  value={visibleDesde}
                  onChange={(e) => setVisibleDesde(e.target.value)}
                  className="ui-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Visible hasta</label>
                <input
                  name="visibleHasta"
                  type="date"
                  value={visibleHasta}
                  onChange={(e) => setVisibleHasta(e.target.value)}
                  className="ui-input"
                />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="obligatorio"
                checked={obligatorio}
                onChange={(e) => setObligatorio(e.target.checked)}
              />
              Comunicado obligatorio
            </label>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold">Vista previa</h2>
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
                  {estado}
                </span>
                {obligatorio ? (
                  <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    Obligatorio
                  </span>
                ) : null}
                <span className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
                  {persistencia}
                </span>
              </div>
              <div className="text-base font-semibold">{titulo || "(Sin titulo)"}</div>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="max-h-60 w-full rounded-lg border object-cover" />
              ) : null}
              <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {cuerpo || "(Sin contenido)"}
              </div>
              {linkUrl ? (
                <a
                  className="text-sm font-medium text-blue-700 underline dark:text-blue-300"
                  href={linkUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {linkLabel || "Abrir enlace"}
                </a>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <div>Destino: {target}</div>
              <div>Prioridad: {prioridad}</div>
              <div>
                Ventana: {visibleDesde || "-"} a {visibleHasta || "-"}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <input type="hidden" name="rolesTarget" value={rolesCsv} />
      <input type="hidden" name="areasTarget" value={areasCsv} />
      <input type="hidden" name="uidsTarget" value={uidsCsv} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          type="submit"
        >
          {mode === "create" ? "Crear comunicado" : "Guardar cambios"}
        </button>
        <a
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          href={backHref}
        >
          Cancelar
        </a>
      </div>
    </div>
  );
}
