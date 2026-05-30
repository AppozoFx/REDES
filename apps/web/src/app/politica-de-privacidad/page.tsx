import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — REDES M&D",
  description:
    "Política de privacidad de la aplicación REDES M&D. Conoce cómo recopilamos, usamos y protegemos tu información.",
};

const LAST_UPDATED = "30 de mayo de 2026";

const SECTIONS = [
  {
    title: "Información que recopilamos",
    items: [
      {
        label: "Datos de ubicación",
        text: "La aplicación recopila datos de ubicación GPS del dispositivo mientras el servicio de seguimiento está activo en primer plano durante la jornada laboral. Esto permite registrar la posición de técnicos y cuadrillas en tiempo real, visualizar recorridos en mapas y gestionar la asignación de órdenes de trabajo. El seguimiento no opera en segundo plano cuando la aplicación está cerrada.",
      },
      {
        label: "Datos de cuenta",
        text: "Nombre, correo electrónico, identificador de usuario, rol asignado (técnico, coordinador, etc.) e información de autenticación proporcionada por Firebase Authentication.",
      },
      {
        label: "Fotografías e imágenes",
        text: "La aplicación puede acceder a la cámara del dispositivo y a la galería de imágenes para adjuntar evidencia fotográfica en procesos de auditoría de inventario de equipos. Las imágenes se almacenan temporalmente en el dispositivo y se suben a Firebase Storage. El acceso a la cámara se realiza únicamente cuando el usuario lo solicita de forma explícita.",
      },
      {
        label: "Información del dispositivo",
        text: "Tipo de dispositivo y versión del sistema operativo Android, utilizados para garantizar la compatibilidad del servicio.",
      },
    ],
  },
  {
    title: "Cómo usamos la información",
    items: [
      {
        label: null,
        text: "Proporcionar y mantener los servicios de la aplicación; gestionar usuarios, técnicos, órdenes de trabajo, equipos, inventario y recursos; registrar y visualizar ubicaciones en tiempo real mediante Google Maps; permitir la auditoría fotográfica de equipos de stock; gestionar la presencia y disponibilidad de cuadrillas; y cumplir obligaciones legales u operativas.",
      },
    ],
  },
  {
    title: "Servicios de terceros",
    items: [
      {
        label: null,
        text: "REDES M&D utiliza los siguientes servicios de terceros: Firebase Authentication (autenticación de usuarios), Cloud Firestore (almacenamiento de datos operativos), Firebase Storage (almacenamiento de imágenes de auditoría) y Google Maps Platform (visualización de mapas y ubicaciones).",
      },
    ],
  },
  {
    title: "Compartición de datos",
    items: [
      {
        label: null,
        text: "No vendemos información personal a terceros. Los datos solo podrán compartirse cuando sea necesario para prestar el servicio, cumplir obligaciones legales o proteger derechos, seguridad o propiedad.",
      },
    ],
  },
  {
    title: "Seguridad",
    items: [
      {
        label: null,
        text: "Implementamos medidas razonables de seguridad para proteger la información contra accesos no autorizados, pérdida, alteración o divulgación.",
      },
    ],
  },
  {
    title: "Retención de datos",
    items: [
      {
        label: null,
        text: "La información se conserva únicamente durante el tiempo necesario para cumplir los fines descritos o las obligaciones legales aplicables.",
      },
    ],
  },
  {
    title: "Derechos del usuario",
    items: [
      {
        label: null,
        text: "Los usuarios pueden solicitar acceso, corrección, eliminación o restricción del tratamiento de sus datos cuando corresponda legalmente.",
      },
    ],
  },
  {
    title: "Menores de edad",
    items: [
      {
        label: null,
        text: "La aplicación no está dirigida a menores de 13 años.",
      },
    ],
  },
  {
    title: "Cambios a esta política",
    items: [
      {
        label: null,
        text: "Podemos actualizar esta política ocasionalmente. Los cambios se publicarán en esta misma página.",
      },
    ],
  },
];

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,.08),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10 md:px-8 md:py-16">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
            REDES M&amp;D
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Política de Privacidad
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Última actualización: {LAST_UPDATED}
          </p>
        </div>

        {/* Intro card */}
        <div className="mb-8 rounded-[1.75rem] border border-white/60 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,.10)] backdrop-blur">
          <p className="text-base leading-7 text-slate-700">
            REDES M&amp;D respeta la privacidad de sus usuarios y se compromete
            a proteger la información personal recopilada durante el uso de la
            aplicación.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_8px_30px_rgba(15,23,42,.05)]"
            >
              <h2 className="mb-4 text-base font-semibold tracking-tight text-slate-950 md:text-lg">
                {section.title}
              </h2>
              <div className="space-y-4">
                {section.items.map((item, i) => (
                  <div key={i}>
                    {item.label && (
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {item.label}
                      </span>
                    )}
                    <p className="text-sm leading-7 text-slate-600 md:text-base">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact card */}
        <div className="mt-8 rounded-[1.75rem] border border-slate-200 bg-slate-950 p-8 text-white shadow-[0_20px_60px_rgba(15,23,42,.15)]">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Contacto
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">
            ¿Tienes preguntas sobre tu privacidad?
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Puedes comunicarte con el desarrollador de la aplicación para
            consultas relacionadas con el tratamiento de tus datos personales.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Desarrollador
              </div>
              <div className="mt-2 text-sm font-medium">AppozoFX</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Aplicación
              </div>
              <div className="mt-2 text-sm font-medium">REDES M&amp;D</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Correo
              </div>
              <div className="mt-2 text-sm font-medium break-all">
                arturo2pozo@gmail.com
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} REDES M&amp;D · AppozoFX
        </p>
      </div>
    </main>
  );
}
