import { TableSchema } from "./types";

export const DB_SCHEMA: TableSchema[] = [
  {
    tableName: "companies",
    description: "Tenants SaaS / Organizaciones (ENTIDAD RAÍZ)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      { name: "name", type: "VARCHAR", description: "Nombre de la Empresa" },
      {
        name: "plan_id",
        type: "VARCHAR",
        isFK: true,
        description: "Ref -> plans.id",
      },
      { name: "status", type: "ENUM", description: "'active', 'suspended'" },
      {
        name: "stripe_customer_id",
        type: "VARCHAR",
        description: "ID Cliente Stripe",
      },
    ],
  },
  {
    tableName: "users",
    description: "Usuarios internos (Agentes) vinculados a una empresa",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "role", type: "ENUM", description: "'admin', 'agent', 'master'" },
    ],
  },
  {
    tableName: "contacts",
    description: "Clientes externos (Usuarios finales).",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "tags", type: "JSONB", description: "Array de IDs de Etiquetas" },
    ],
  },
  {
    tableName: "documents",
    description:
      "Base de Conocimiento RAG (Generación Aumentada por Recuperación)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "content_vector",
        type: "VECTOR(1536)",
        description: "Embedding para búsqueda semntica",
      },
    ],
  },
  {
    tableName: "tags",
    description: "Etiquetas para categorizar tickets",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "name", type: "VARCHAR", description: "Nombre de la Etiqueta" },
    ],
  },
  {
    tableName: "webhooks",
    description:
      "Configuración de URLs para Webhooks Salientes (Developer API)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "url",
        type: "VARCHAR",
        description: "Endpoint destino del cliente",
      },
    ],
  },
  {
    tableName: "conversations",
    description: "Sesiones de mensajería unificada (WhatsApp, Instagram, etc.)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "status",
        type: "ENUM",
        description: "'OPEN', 'CLOSED', 'RESOLVED'",
      },
      {
        name: "channel_id",
        type: "VARCHAR",
        description: "ID externo del canal",
      },
    ],
  },
  {
    tableName: "messages",
    description: "Historial de mensajes individuales",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "conversation_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> conversations.id",
      },
      { name: "content", type: "TEXT", description: "Contenido del mensaje" },
      { name: "direction", type: "ENUM", description: "'INBOUND', 'OUTBOUND'" },
    ],
  },
  {
    tableName: "tickets",
    description: "Casos de soporte y atención al cliente",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "status", type: "ENUM", description: "Estado del ticket" },
      { name: "priority", type: "ENUM", description: "Prioridad" },
      {
        name: "queue_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> queues.id",
      },
    ],
  },
  {
    tableName: "queues",
    description: "Colas de distribución de tickets y chats",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "type",
        type: "ENUM",
        description: "'MANUAL', 'ROUND_ROBIN', 'AI'",
      },
    ],
  },
  {
    tableName: "plans",
    description: "Definición de planes de suscripción y límites",
    columns: [
      {
        name: "id",
        type: "VARCHAR",
        isPK: true,
        description: 'ID del Plan (ej: "pro")',
      },
      { name: "price", type: "FLOAT", description: "Precio mensual" },
      {
        name: "config",
        type: "JSONB",
        description: "Límites y features habilitados",
      },
    ],
  },
  {
    tableName: "campaigns",
    description: "Campañas de marketing masivo (Broadcasting)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "status",
        type: "VARCHAR",
        description: "'draft', 'scheduled', 'completed'",
      },
      { name: "stats", type: "JSONB", description: "Métricas de envío" },
    ],
  },
  {
    tableName: "flows",
    description: "Flujos de chatbot visuales (Nodos y Aristas)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "nodes",
        type: "JSONB",
        description: "Definición de pasos del bot",
      },
      { name: "is_active", type: "BOOLEAN", description: "Estado del flujo" },
    ],
  },
  {
    tableName: "accounts",
    description: "Cuentas/Empresas en el CRM (B2B)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "industry", type: "VARCHAR", description: "Industria" },
      { name: "status", type: "VARCHAR", description: "Estado de la cuenta" },
    ],
  },
  {
    tableName: "deals",
    description: "Oportunidades de venta en el Pipeline",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "value", type: "FLOAT", description: "Valor monetario" },
      { name: "stage", type: "ENUM", description: "Etapa del embudo" },
    ],
  },
  {
    tableName: "activities",
    description: "Registro de actividades CRM (Llamadas, Notas, Tareas)",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "type", type: "ENUM", description: "Tipo de actividad" },
      { name: "status", type: "VARCHAR", description: "Estado" },
    ],
  },
  {
    tableName: "media",
    description: "Biblioteca de archivos multimedia",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      { name: "url", type: "VARCHAR", description: "URL del archivo (S3)" },
      {
        name: "type",
        type: "ENUM",
        description: "'IMAGE', 'VIDEO', 'DOCUMENT'",
      },
    ],
  },
  {
    tableName: "ai_assistants",
    description: "Configuración de Agentes IA personalizados",
    columns: [
      { name: "id", type: "UUID", isPK: true, description: "Clave Primaria" },
      {
        name: "company_id",
        type: "UUID",
        isFK: true,
        description: "Ref -> companies.id",
      },
      {
        name: "model_provider",
        type: "VARCHAR",
        description: "'OPENAI', 'GEMINI'",
      },
      {
        name: "system_prompt",
        type: "TEXT",
        description: "Instrucciones base",
      },
    ],
  },
];
