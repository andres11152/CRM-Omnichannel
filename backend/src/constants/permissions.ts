/**
 * [AUTH] CATÁLOGO DE PERMISOS — FUENTE ÚNICA DE VERDAD (RBAC)
 *
 * Define los módulos, acciones y recursos disponibles para los roles
 * personalizados. Tanto el backend (validación + endpoint) como el frontend
 * (editor de permisos) consumen ESTE catálogo, evitando duplicación/hardcoding
 * y drift entre capas.
 */

export type PermissionModule =
  | "CONVERSATIONS"
  | "TICKETS"
  | "CONTACTS"
  | "DEALS"
  | "REPORTS"
  | "TEAM"
  | "SETTINGS"
  | "QUEUES";

export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "EDIT"
  | "DELETE"
  | "ASSIGN"
  | "EXPORT"
  | "IMPORT"
  | "MANAGE";

export interface CatalogPermission {
  action: PermissionAction;
  resource: string;
  label: string;
  description: string;
}

export interface CatalogModule {
  id: PermissionModule;
  name: string;
  description: string;
  permissions: CatalogPermission[];
}

/**
 * El catálogo. Cada entrada describe un permiso atómico (módulo+acción+recurso).
 */
export const PERMISSION_CATALOG: readonly CatalogModule[] = [
  {
    id: "CONVERSATIONS",
    name: "Conversaciones",
    description: "Gestión de conversaciones y mensajería",
    permissions: [
      { action: "VIEW", resource: "own", label: "Ver propias", description: "Ver solo conversaciones asignadas" },
      { action: "VIEW", resource: "team", label: "Ver del equipo", description: "Ver conversaciones del equipo" },
      { action: "VIEW", resource: "all", label: "Ver todas", description: "Ver todas las conversaciones" },
      { action: "CREATE", resource: "any", label: "Crear", description: "Iniciar nuevas conversaciones" },
      { action: "ASSIGN", resource: "any", label: "Asignar", description: "Asignar conversaciones a agentes" },
      { action: "EXPORT", resource: "any", label: "Exportar", description: "Exportar historial de conversaciones" },
    ],
  },
  {
    id: "TICKETS",
    name: "Tickets",
    description: "Gestión de tickets de soporte",
    permissions: [
      { action: "VIEW", resource: "own", label: "Ver propios", description: "Ver solo tickets asignados" },
      { action: "VIEW", resource: "queue", label: "Ver cola", description: "Ver tickets en cola" },
      { action: "VIEW", resource: "all", label: "Ver todos", description: "Ver todos los tickets" },
      { action: "CREATE", resource: "any", label: "Crear", description: "Crear nuevos tickets" },
      { action: "EDIT", resource: "own", label: "Editar propios", description: "Editar tickets asignados" },
      { action: "EDIT", resource: "all", label: "Editar todos", description: "Editar cualquier ticket" },
      { action: "ASSIGN", resource: "any", label: "Asignar", description: "Asignar tickets a agentes" },
    ],
  },
  {
    id: "CONTACTS",
    name: "Contactos",
    description: "Gestión de contactos y clientes",
    permissions: [
      { action: "VIEW", resource: "own", label: "Ver propios", description: "Ver contactos creados por uno" },
      { action: "VIEW", resource: "all", label: "Ver todos", description: "Ver todos los contactos" },
      { action: "CREATE", resource: "any", label: "Crear", description: "Crear nuevos contactos" },
      { action: "EDIT", resource: "own", label: "Editar propios", description: "Editar contactos propios" },
      { action: "EDIT", resource: "all", label: "Editar todos", description: "Editar cualquier contacto" },
      { action: "DELETE", resource: "all", label: "Eliminar", description: "Eliminar contactos" },
      { action: "IMPORT", resource: "any", label: "Importar", description: "Importar contactos desde CSV" },
      { action: "EXPORT", resource: "any", label: "Exportar", description: "Exportar contactos" },
    ],
  },
  {
    id: "DEALS",
    name: "Deals / Ventas",
    description: "Gestión de oportunidades de venta",
    permissions: [
      { action: "VIEW", resource: "own", label: "Ver propios", description: "Ver deals asignados" },
      { action: "VIEW", resource: "all", label: "Ver todos", description: "Ver todos los deals" },
      { action: "CREATE", resource: "any", label: "Crear", description: "Crear nuevos deals" },
      { action: "EDIT", resource: "own", label: "Editar propios", description: "Editar deals asignados" },
      { action: "EDIT", resource: "all", label: "Editar todos", description: "Editar cualquier deal" },
      { action: "ASSIGN", resource: "any", label: "Asignar", description: "Asignar deals a agentes" },
    ],
  },
  {
    id: "REPORTS",
    name: "Reportes",
    description: "Acceso a reportes y analítica",
    permissions: [
      { action: "VIEW", resource: "basic", label: "Ver básicos", description: "Ver reportes básicos" },
      { action: "VIEW", resource: "advanced", label: "Ver avanzados", description: "Ver reportes avanzados" },
      { action: "EXPORT", resource: "any", label: "Exportar", description: "Exportar reportes" },
    ],
  },
  {
    id: "TEAM",
    name: "Equipo",
    description: "Gestión de equipo y usuarios",
    permissions: [
      { action: "VIEW", resource: "all", label: "Ver equipo", description: "Ver lista de usuarios" },
      { action: "CREATE", resource: "any", label: "Invitar", description: "Invitar nuevos usuarios" },
      { action: "EDIT", resource: "any", label: "Editar", description: "Editar usuarios" },
      { action: "DELETE", resource: "any", label: "Eliminar", description: "Eliminar usuarios" },
      { action: "MANAGE", resource: "roles", label: "Gestionar roles", description: "Asignar y gestionar roles" },
    ],
  },
  {
    id: "SETTINGS",
    name: "Configuración",
    description: "Configuración del sistema",
    permissions: [
      { action: "VIEW", resource: "company", label: "Ver empresa", description: "Ver configuración de empresa" },
      { action: "EDIT", resource: "company", label: "Editar empresa", description: "Editar configuración de empresa" },
      { action: "MANAGE", resource: "integrations", label: "Integraciones", description: "Gestionar integraciones" },
      { action: "MANAGE", resource: "billing", label: "Facturación", description: "Gestionar facturación y planes" },
    ],
  },
  {
    id: "QUEUES",
    name: "Colas",
    description: "Gestión de colas de atención",
    permissions: [
      { action: "VIEW", resource: "assigned", label: "Ver asignadas", description: "Ver colas asignadas" },
      { action: "VIEW", resource: "all", label: "Ver todas", description: "Ver todas las colas" },
      { action: "MANAGE", resource: "any", label: "Gestionar", description: "Gestión completa de colas" },
    ],
  },
];

/** Clave canónica de un permiso atómico. */
export const permissionKey = (module: string, action: string, resource: string): string =>
  `${module}:${action}:${resource}`;

/** Conjunto de claves válidas, para validación O(1). */
export const VALID_PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.flatMap((m) =>
    m.permissions.map((p) => permissionKey(m.id, p.action, p.resource)),
  ),
);

export const PERMISSION_MODULES: readonly PermissionModule[] = PERMISSION_CATALOG.map((m) => m.id);

export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "ASSIGN",
  "EXPORT",
  "IMPORT",
  "MANAGE",
];

/** Valida que un permiso (módulo+acción+recurso) exista en el catálogo. */
export const isValidPermission = (
  module: string,
  action: string,
  resource: string,
): boolean => VALID_PERMISSION_KEYS.has(permissionKey(module, action, resource));
