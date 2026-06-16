import React from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

export const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-reply-bg-dark text-gray-800 dark:text-gray-200 py-12 px-4 sm:px-6 lg:px-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto bg-white dark:bg-reply-panel-dark rounded-2xl shadow-xl border border-gray-150 dark:border-reply-border-dark overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-teal-600 to-indigo-600 p-8 text-white relative">
          <Link
            to="/login"
            className="absolute top-6 left-6 flex items-center gap-2 text-white/90 hover:text-white font-semibold text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al Login
          </Link>
          <div className="flex items-center gap-3 mt-8">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Política de Privacidad y Habeas Data</h1>
              <p className="text-white/80 text-sm mt-1">
                En estricto cumplimiento de la Ley 1581 de 2012 de la República de Colombia
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-teal-650 dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">1.</span> Identificación del Responsable del Tratamiento
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              El responsable del tratamiento de sus datos personales recolectados a través de esta Plataforma es <strong>Andres Felipe Betancourt Ortiz</strong>, persona natural residente en la República de Colombia, con domicilio principal en Bucaramanga y canal de contacto legal establecido.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-teal-650 dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">2.</span> Marco Legal Aplicable (Habeas Data)
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              Esta política ha sido redactada de conformidad con la <strong>Constitución Política de Colombia (Artículo 15)</strong>, la <strong>Ley 1581 de 2012</strong> (Ley General de Protección de Datos Personales), el <strong>Decreto 1377 de 2013</strong> y demás decretos reglamentarios vigentes que regulan el almacenamiento, recolección y tratamiento de la información de personas naturales.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-teal-650 dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">3.</span> Finalidad del Tratamiento de Datos
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              Los datos recolectados por la Plataforma, incluyendo información de contactos importados, tickets de soporte e historial de mensajería omnicanal, serán utilizados estrictamente para las siguientes finalidades:
            </p>
            <ul className="text-xs space-y-2 text-gray-650 dark:text-gray-400 list-disc pl-5 mt-2">
              <li>Prestación y mantenimiento técnico de los servicios del CRM.</li>
              <li>Soporte técnico, personalización de la inteligencia artificial y optimización de flujos de atención.</li>
              <li>Facturación, procesamiento de pagos y auditoría de límites de suscripción.</li>
              <li>Cumplimiento de órdenes legales o judiciales emanadas por autoridades colombianas competentes (ej. Superintendencia de Industria y Comercio).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-teal-650 dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">4.</span> Derechos de los Titulares de Datos
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              De acuerdo con las leyes colombianas, el titular de la información posee los siguientes derechos constitucionales:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div className="bg-teal-50/45 dark:bg-teal-950/15 p-3 rounded-xl border border-teal-100/50 dark:border-teal-900/35">
                <span className="text-xs font-bold text-teal-700 dark:text-teal-400 block mb-1">Acceso y Consulta</span>
                <span className="text-2xs text-gray-500 dark:text-gray-450">Conocer la información personal que reposa en nuestras bases de datos en cualquier momento.</span>
              </div>
              <div className="bg-indigo-50/45 dark:bg-indigo-950/15 p-3 rounded-xl border border-indigo-100/50 dark:border-indigo-900/35">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 block mb-1">Actualización y Rectificación</span>
                <span className="text-2xs text-gray-500 dark:text-gray-450">Solicitar la corrección de datos parciales, inexactos, incompletos, fraccionados o engañosos.</span>
              </div>
              <div className="bg-purple-50/45 dark:bg-purple-950/15 p-3 rounded-xl border border-purple-100/50 dark:border-purple-900/35">
                <span className="text-xs font-bold text-purple-700 dark:text-purple-400 block mb-1">Supresión y Revocatoria</span>
                <span className="text-2xs text-gray-500 dark:text-gray-450">Exigir la eliminación de la información cuando no se respeten los principios constitucionales.</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-teal-650 dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">5.</span> Canales de Atención para Habeas Data
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              Para ejercer sus derechos constitucionales de Habeas Data, usted puede radicar una petición al correo oficial de protección de datos: <a href="mailto:privacidad@sentrycrm.cloud" className="text-reply-green hover:underline">privacidad@sentrycrm.cloud</a>. Las consultas serán atendidas en un plazo máximo de diez (10) días hábiles, y los reclamos en quince (15) días hábiles, de acuerdo con los términos de ley.
            </p>
          </section>
        </div>

        {/* Footer Meta */}
        <div className="bg-gray-50 dark:bg-reply-panel-dark/50 p-6 border-t border-gray-100 dark:border-reply-border-dark flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span>Última actualización: 16 de Junio de 2026</span>
          <span className="flex items-center gap-1.5 font-semibold text-teal-600 dark:text-teal-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Andres Felipe Betancourt Ortiz
          </span>
        </div>
      </div>
    </div>
  );
};
