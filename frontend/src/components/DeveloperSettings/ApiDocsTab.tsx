import React from "react";
import { Code } from "lucide-react";
import { Card } from "../ui/Card";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/messages/send",
    label: "Enviar Mensaje WhatsApp",
    color: "emerald",
    body: `{
  "to": "573001234567",
  "text": "Hola, este es un mensaje automático desde la API de Sentry."
}`,
  },
  {
    method: "POST",
    path: "/contacts",
    label: "Crear o Actualizar Contacto",
    color: "emerald",
    body: `{
  "name": "Juan Pérez",
  "phone": "573001234567",
  "email": "juan@empresa.com",
  "tags": ["Cliente VIP", "API"]
}`,
  },
  {
    method: "POST",
    path: "/deals",
    label: "Crear Oportunidad (Deal)",
    color: "emerald",
    body: `{
  "title": "Renovación 2025",
  "value": 15000,
  "currency": "USD",
  "pipelineId": "<cuid_pipeline>",
  "stageId": "<cuid_stage>"
}`,
  },
  {
    method: "GET",
    path: "/tickets",
    label: "Listar Tickets",
    color: "sky",
    body: null,
  },
];

export const ApiDocsTab: React.FC = () => {
  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <Card className="p-6">
        <div className="mb-6">
          <h3 className="font-bold text-reply-text-primary dark:text-white text-xl flex items-center gap-2">
            <Code className="w-6 h-6 text-reply-brand" />
            Referencia de API REST
          </h3>
          <p className="text-sm text-reply-text-secondary dark:text-reply-text-secondary-dark mt-2 leading-relaxed">
            Integra Sentry con tus sistemas internos. Autentícate enviando tu API Key en el header{" "}
            <code className="bg-reply-bg dark:bg-reply-bg-dark px-1.5 py-0.5 rounded text-reply-brand dark:text-reply-brand-light font-mono text-xs border border-reply-border dark:border-reply-border-dark">
              X-API-Key
            </code>
            . Base URL:{" "}
            <code className="bg-reply-bg dark:bg-reply-bg-dark px-1.5 py-0.5 rounded text-reply-brand dark:text-reply-brand-light font-mono text-xs border border-reply-border dark:border-reply-border-dark">
              https://api.sentrycrm.cloud/api/v1/external
            </code>
          </p>
        </div>

        <div className="space-y-8">
          {/* Webhook payload reference */}
          <div className="border border-amber-200 dark:border-amber-900/50 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-amber-50 dark:bg-amber-950/30 p-4 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-4">
              <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider">
                PAYLOAD
              </span>
              <span className="font-mono text-sm text-reply-text-primary dark:text-white font-bold">Estructura de Evento Webhook</span>
            </div>
            <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
              <pre>{`{
  "id": "evt_1750000000_a1b2c3d4",
  "object": "event",
  "apiVersion": "2025-04-01",
  "created": 1750000000,
  "type": "ticket.created",
  "data": {
    "object": { /* payload específico del evento */ }
  }
}

// Header de verificación HMAC-SHA256:
// X-Sentry-Signature: t=<timestamp>,v1=<sha256_hex>
// Verifica: HMAC-SHA256(secret, "<timestamp>.<json_body>")`}</pre>
            </div>
          </div>

          {ENDPOINTS.map(({ method, path, label, color, body }) => (
            <div key={path} className="border border-reply-border dark:border-reply-border-dark rounded-xl overflow-hidden shadow-sm">
              <div className="bg-reply-bg dark:bg-reply-bg-dark/50 p-4 border-b border-reply-border dark:border-reply-border-dark flex items-center gap-4">
                <span
                  className={`bg-${color}-500/10 text-${color}-600 dark:text-${color}-400 border border-${color}-500/20 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider`}
                >
                  {method}
                </span>
                <span className="font-mono text-sm text-reply-text-primary dark:text-white font-bold">{path}</span>
                <span className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark ml-auto hidden sm:block">{label}</span>
              </div>
              <div className="p-4 bg-gray-900 text-gray-300 font-mono text-xs overflow-x-auto">
                <pre>{`curl -X ${method} https://api.sentrycrm.cloud/api/v1/external${path} \\
  -H "X-API-Key: tu_api_key_aqui"${
    body
      ? ` \\
  -H "Content-Type: application/json" \\
  -d '${body}'`
      : ""
  }`}</pre>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
