/**
 * 🛡️ RBAC (Role-Based Access Control) System
 * Granular permission management for enterprise SaaS
 */

export enum Permission {
  // User Management
  USER_CREATE = "user:create",
  USER_READ = "user:read",
  USER_UPDATE = "user:update",
  USER_DELETE = "user:delete",

  // Company Management
  COMPANY_READ = "company:read",
  COMPANY_UPDATE = "company:update",
  COMPANY_DELETE = "company:delete",
  COMPANY_SETTINGS = "company:settings",

  // Conversations & Messages
  CONVERSATION_READ = "conversation:read",
  CONVERSATION_CREATE = "conversation:create",
  CONVERSATION_ASSIGN = "conversation:assign",
  MESSAGE_SEND = "message:send",
  MESSAGE_DELETE = "message:delete",

  // Tickets
  TICKET_READ = "ticket:read",
  TICKET_CREATE = "ticket:create",
  TICKET_UPDATE = "ticket:update",
  TICKET_ASSIGN = "ticket:assign",
  TICKET_RESOLVE = "ticket:resolve",

  // Queues
  QUEUE_READ = "queue:read",
  QUEUE_CREATE = "queue:create",
  QUEUE_UPDATE = "queue:update",
  QUEUE_DELETE = "queue:delete",

  // WhatsApp
  WHATSAPP_CONNECT = "whatsapp:connect",
  WHATSAPP_DISCONNECT = "whatsapp:disconnect",
  WHATSAPP_SEND = "whatsapp:send",

  // Campaigns
  CAMPAIGN_READ = "campaign:read",
  CAMPAIGN_CREATE = "campaign:create",
  CAMPAIGN_UPDATE = "campaign:update",
  CAMPAIGN_DELETE = "campaign:delete",
  CAMPAIGN_SEND = "campaign:send",

  // AI
  AI_CONFIG = "ai:config",
  AI_USE = "ai:use",

  // CRM
  CONTACT_READ = "contact:read",
  CONTACT_CREATE = "contact:create",
  CONTACT_UPDATE = "contact:update",
  CONTACT_DELETE = "contact:delete",

  DEAL_READ = "deal:read",
  DEAL_CREATE = "deal:create",
  DEAL_UPDATE = "deal:update",
  DEAL_DELETE = "deal:delete",

  // Analytics
  ANALYTICS_VIEW = "analytics:view",
  ANALYTICS_EXPORT = "analytics:export",

  // Billing
  BILLING_VIEW = "billing:view",
  BILLING_MANAGE = "billing:manage",

  // Admin (Master only)
  ADMIN_IMPERSONATE = "admin:impersonate",
  ADMIN_MANAGE_TENANTS = "admin:manage_tenants",
  ADMIN_MANAGE_PLANS = "admin:manage_plans",
  ADMIN_VIEW_SYSTEM = "admin:view_system",
}

/**
 * Role to Permissions Mapping
 */
export const RolePermissions: Record<string, Permission[]> = {
  MASTER: [
    // Masters have ALL permissions
    ...Object.values(Permission),
  ],

  ADMIN: [
    // User Management
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,

    // Company
    Permission.COMPANY_READ,
    Permission.COMPANY_UPDATE,
    Permission.COMPANY_SETTINGS,

    // Conversations
    Permission.CONVERSATION_READ,
    Permission.CONVERSATION_CREATE,
    Permission.CONVERSATION_ASSIGN,
    Permission.MESSAGE_SEND,
    Permission.MESSAGE_DELETE,

    // Tickets
    Permission.TICKET_READ,
    Permission.TICKET_CREATE,
    Permission.TICKET_UPDATE,
    Permission.TICKET_ASSIGN,
    Permission.TICKET_RESOLVE,

    // Queues
    Permission.QUEUE_READ,
    Permission.QUEUE_CREATE,
    Permission.QUEUE_UPDATE,
    Permission.QUEUE_DELETE,

    // WhatsApp
    Permission.WHATSAPP_CONNECT,
    Permission.WHATSAPP_DISCONNECT,
    Permission.WHATSAPP_SEND,

    // Campaigns
    Permission.CAMPAIGN_READ,
    Permission.CAMPAIGN_CREATE,
    Permission.CAMPAIGN_UPDATE,
    Permission.CAMPAIGN_DELETE,
    Permission.CAMPAIGN_SEND,

    // AI
    Permission.AI_CONFIG,
    Permission.AI_USE,

    // CRM
    Permission.CONTACT_READ,
    Permission.CONTACT_CREATE,
    Permission.CONTACT_UPDATE,
    Permission.CONTACT_DELETE,
    Permission.DEAL_READ,
    Permission.DEAL_CREATE,
    Permission.DEAL_UPDATE,
    Permission.DEAL_DELETE,

    // Analytics
    Permission.ANALYTICS_VIEW,
    Permission.ANALYTICS_EXPORT,

    // Billing
    Permission.BILLING_VIEW,
    Permission.BILLING_MANAGE,
  ],

  AGENT: [
    // User (self only)
    Permission.USER_READ,

    // Conversations
    Permission.CONVERSATION_READ,
    Permission.MESSAGE_SEND,

    // Tickets (assigned only)
    Permission.TICKET_READ,
    Permission.TICKET_UPDATE,
    Permission.TICKET_RESOLVE,

    // Queues (read only)
    Permission.QUEUE_READ,

    // WhatsApp (send only)
    Permission.WHATSAPP_SEND,

    // AI (use only)
    Permission.AI_USE,

    // CRM (read + create)
    Permission.CONTACT_READ,
    Permission.CONTACT_CREATE,
    Permission.CONTACT_UPDATE,
    Permission.DEAL_READ,
    Permission.DEAL_CREATE,
    Permission.DEAL_UPDATE,
  ],
};

/**
 * Check if a role has a specific permission
 */
export const hasPermission = (
  role: string,
  permission: Permission
): boolean => {
  const permissions = RolePermissions[role] || [];
  return permissions.includes(permission);
};

/**
 * Check if a role has ANY of the specified permissions
 */
export const hasAnyPermission = (
  role: string,
  permissions: Permission[]
): boolean => {
  return permissions.some((p) => hasPermission(role, p));
};

/**
 * Check if a role has ALL of the specified permissions
 */
export const hasAllPermissions = (
  role: string,
  permissions: Permission[]
): boolean => {
  return permissions.every((p) => hasPermission(role, p));
};

/**
 * Get all permissions for a role
 */
export const getPermissions = (role: string): Permission[] => {
  return RolePermissions[role] || [];
};
