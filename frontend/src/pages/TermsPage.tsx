import React from "react";
import { Link } from "react-router-dom";
import { Shield, FileText, ArrowLeft, CheckCircle2 } from "lucide-react";

export const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-reply-bg-dark text-gray-800 dark:text-gray-200 py-12 px-4 sm:px-6 lg:px-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto bg-white dark:bg-reply-panel-dark rounded-2xl shadow-xl border border-gray-150 dark:border-reply-border-dark overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-reply-brand to-teal-600 p-8 text-white relative">
          <Link
            to="/login"
            className="absolute top-6 left-6 flex items-center gap-2 text-white/90 hover:text-white font-semibold text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al Login
          </Link>
          <div className="flex items-center gap-3 mt-8">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Términos y Condiciones de Uso</h1>
              <p className="text-white/80 text-sm mt-1">
                SaaS CRM Omnicanal - Conforme a la legislación de la República de Colombia
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-reply-brand dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">1.</span> Objeto y Aceptación de los Términos
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              El presente documento establece los Términos y Condiciones bajo los cuales <strong>Andres Felipe Betancourt Ortiz</strong> (en adelante, el "Proveedor"), persona natural identificada bajo las leyes de Colombia, provee el acceso y uso del Software como Servicio (SaaS) CRM Omnicanal (en adelante, "la Plataforma"). Al acceder, navegar o utilizar la Plataforma, usted acepta de manera incondicional estar obligado por estos Términos.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-reply-brand dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">2.</span> Normativa Legal Aplicable (Colombia)
            </h2>
            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-950/40 space-y-2">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Cumplimiento Legal Obligatorio</p>
              <ul className="text-xs space-y-2 text-gray-650 dark:text-gray-400 list-disc pl-4">
                <li><strong>Comercio Electrónico:</strong> Ley 527 de 1999, que reglamenta el acceso y uso de los mensajes de datos, comercio electrónico y las firmas digitales.</li>
                <li><strong>Protección del Consumidor:</strong> Ley 1480 de 2011 (Estatuto del Consumidor) en lo referente a ventas a distancia y portales de comercio electrónico.</li>
                <li><strong>Habeas Data:</strong> Ley 1266 de 2008 y Ley Estatutaria 1581 de 2012 para el tratamiento de datos personales en el territorio nacional.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-reply-brand dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">3.</span> Obligaciones del Tenant (Usuario Cliente)
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              El cliente se compromete a hacer uso de la Plataforma exclusivamente para fines legítimos. Queda estrictamente prohibido el envío de spam, distribución de malware, almacenamiento de contenido que infrinja derechos de autor o el uso indebido de las APIs de integraciones de mensajería (tales como WhatsApp Business API de Meta o integraciones Baileys no autorizadas).
            </p>
            <div className="bg-red-50/50 dark:bg-red-950/20 p-4 rounded-xl border border-red-100 dark:border-red-950/40 text-xs text-red-700 dark:text-red-400">
              <strong>Advertencia de Responsabilidad:</strong> El mal uso de las integraciones de mensajería que resulte en el baneo de números de teléfono es responsabilidad exclusiva del Tenant. El Proveedor no compensará pérdidas operativas bajo ningún escenario.
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-reply-brand dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">4.</span> Niveles de Servicio (SLA) y Disponibilidad
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              El Proveedor garantiza un esfuerzo comercialmente razonable para mantener una disponibilidad de la Plataforma del 99.9% anual. Se excluyen del cálculo de SLA las ventanas de mantenimiento programadas e informadas con un mínimo de 24 horas de antelación, y caídas ocasionadas por problemas de conectividad de la infraestructura cloud global (AWS, Render, Google Cloud).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-reply-brand dark:text-teal-400 flex items-center gap-2 border-b pb-2 border-gray-100 dark:border-gray-800">
              <span className="text-lg">5.</span> Resolución de Conflictos y Jurisdicción
            </h2>
            <p className="text-sm leading-relaxed text-gray-650 dark:text-gray-400">
              Cualquier controversia derivada de la interpretación o ejecución de estos términos será resuelta en primera instancia mediante arreglo directo o conciliación en un Centro de Conciliación autorizado en la ciudad de <strong>Bucaramanga, Colombia</strong>. En caso de no llegar a un acuerdo, la controversia se someterá a la jurisdicción ordinaria de la República de Colombia.
            </p>
          </section>
        </div>

        {/* Footer Meta */}
        <div className="bg-gray-50 dark:bg-reply-panel-dark/50 p-6 border-t border-gray-100 dark:border-reply-border-dark flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span>Última actualización: 16 de Junio de 2026</span>
          <span className="flex items-center gap-1.5 font-semibold text-reply-brand dark:text-teal-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Andres Felipe Betancourt Ortiz
          </span>
        </div>
      </div>
    </div>
  );
};
