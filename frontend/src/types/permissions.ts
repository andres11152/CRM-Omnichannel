/**
 * [SEC] Permission Types
 * Must match backend Permission enum exactly
 */
export type Permission =
  // User Management
  | "user:create"
  | "user:read"
  | "user:update"
  | "user:delete"

  // Company Management
  | "company:read"
  | "company:update"
  | "company:delete"
  | "company:settings"

  // Conversations & Messages
  | "conversation:read"
  | "conversation:create"
  | "conversation:assign"
  | "message:send"
  | "message:delete"

  // Tickets
  | "ticket:read"
  | "ticket:create"
  | "ticket:update"
  | "ticket:assign"
  | "ticket:resolve"

  // Queues
  | "queue:read"
  | "queue:create"
  | "queue:update"
  | "queue:delete"

  // WhatsApp
  | "whatsapp:connect"
  | "whatsapp:disconnect"
  | "whatsapp:send"

  // Campaigns
  | "campaign:read"
  | "campaign:create"
  | "campaign:update"
  | "campaign:delete"
  | "campaign:send"

  // AI
  | "ai:config"
  | "ai:use"

  // CRM
  | "contact:read"
  | "contact:create"
  | "contact:update"
  | "contact:delete"
  | "deal:read"
  | "deal:create"
  | "deal:update"
  | "deal:delete"

  // Analytics
  | "analytics:view"
  | "analytics:export"

  // Billing
  | "billing:view"
  | "billing:manage"

  // Admin (Master only)
  | "admin:impersonate"
  | "admin:manage_tenants"
  | "admin:manage_plans"
  | "admin:view_system";
