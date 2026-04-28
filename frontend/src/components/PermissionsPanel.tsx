import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { fetchAPI } from "@/services/apiConfig";
import { 
  Shield, 
  Plus, 
  Users, 
  Lock, 
  MessageSquare, 
  Ticket, 
  Contact, 
  DollarSign, 
  BarChart, 
  Settings, 
  List,
  ChevronDown,
  ChevronRight,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X
} from "lucide-react";
import "../styles/PermissionsPanel.css";

/**
 * [AUTH] PROFESSIONAL PERMISSIONS PANEL
 * Granular permission management with modern toggle switches
 * 100-Year Enterprise Solution
 */

// ─────────────────────────────────────────────────────────────────
// [SEC] TYPE DEFINITIONS (No ANY types - Strict TypeScript)
// ─────────────────────────────────────────────────────────────────

interface Permission {
  id: string;
  module: string;
  action: string;
  resource: string;
  description?: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  baseRole: "MASTER" | "ADMIN" | "AGENT";
  isSystem: boolean;
  isActive: boolean;
  permissions: Permission[];
  _count?: {
    users: number;
  };
}

interface PermissionDefinition {
  action: string;
  resource: string;
  label: string;
  description: string;
}

interface PermissionModule {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  permissions: PermissionDefinition[];
}

// ─────────────────────────────────────────────────────────────────
//  PERMISSION MODULES CATALOG
// ─────────────────────────────────────────────────────────────────

const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "CONVERSATIONS",
    name: "Conversaciónes",
    icon: <MessageSquare size={18} />,
    description: "Gestión de conversaciones y mensajería",
    permissions: [
      {
        action: "VIEW",
        resource: "own",
        label: "Ver propias",
        description: "Ver solo conversaciones asignadas",
      },
      {
        action: "VIEW",
        resource: "team",
        label: "Ver del equipo",
        description: "Ver conversaciones del equipo",
      },
      {
        action: "VIEW",
        resource: "all",
        label: "Ver todas",
        description: "Ver todas las conversaciones",
      },
      {
        action: "CREATE",
        resource: "any",
        label: "Crear",
        description: "Iniciar nuevas conversaciones",
      },
      {
        action: "ASSIGN",
        resource: "any",
        label: "Asignar",
        description: "Asignar conversaciones a agentes",
      },
      {
        action: "EXPORT",
        resource: "any",
        label: "Exportar",
        description: "Exportar historial de conversaciones",
      },
    ],
  },
  {
    id: "TICKETS",
    name: "Tickets",
    icon: <Ticket size={18} />,
    description: "Gestión de tickets de soporte",
    permissions: [
      {
        action: "VIEW",
        resource: "own",
        label: "Ver propios",
        description: "Ver solo tickets asignados",
      },
      {
        action: "VIEW",
        resource: "queue",
        label: "Ver cola",
        description: "Ver tickets en cola",
      },
      {
        action: "VIEW",
        resource: "all",
        label: "Ver todos",
        description: "Ver todos los tickets",
      },
      {
        action: "CREATE",
        resource: "any",
        label: "Crear",
        description: "Crear nuevos tickets",
      },
      {
        action: "EDIT",
        resource: "own",
        label: "Editar propios",
        description: "Editar tickets asignados",
      },
      {
        action: "EDIT",
        resource: "all",
        label: "Editar todos",
        description: "Editar cualquier ticket",
      },
      {
        action: "ASSIGN",
        resource: "any",
        label: "Asignar",
        description: "Asignar tickets a agentes",
      },
    ],
  },
  {
    id: "CONTACTS",
    name: "Contactos",
    icon: <Contact size={18} />,
    description: "Gestión de contactos y clientes",
    permissions: [
      {
        action: "VIEW",
        resource: "own",
        label: "Ver propios",
        description: "Ver contactos creados por uno",
      },
      {
        action: "VIEW",
        resource: "all",
        label: "Ver todos",
        description: "Ver todos los contactos",
      },
      {
        action: "CREATE",
        resource: "any",
        label: "Crear",
        description: "Crear nuevos contactos",
      },
      {
        action: "EDIT",
        resource: "own",
        label: "Editar propios",
        description: "Editar contactos propios",
      },
      {
        action: "EDIT",
        resource: "all",
        label: "Editar todos",
        description: "Editar cualquier contacto",
      },
      {
        action: "DELETE",
        resource: "all",
        label: "Eliminar",
        description: "Eliminar contactos",
      },
      {
        action: "IMPORT",
        resource: "any",
        label: "Importar",
        description: "Importar contactos desde CSV",
      },
      {
        action: "EXPORT",
        resource: "any",
        label: "Exportar",
        description: "Exportar contactos",
      },
    ],
  },
  {
    id: "DEALS",
    name: "Deals / Ventas",
    icon: <DollarSign size={18} />,
    description: "Gestión de oportunidades de venta",
    permissions: [
      {
        action: "VIEW",
        resource: "own",
        label: "Ver propios",
        description: "Ver deals asignados",
      },
      {
        action: "VIEW",
        resource: "all",
        label: "Ver todos",
        description: "Ver todos los deals",
      },
      {
        action: "CREATE",
        resource: "any",
        label: "Crear",
        description: "Crear nuevos deals",
      },
      {
        action: "EDIT",
        resource: "own",
        label: "Editar propios",
        description: "Editar deals asignados",
      },
      {
        action: "EDIT",
        resource: "all",
        label: "Editar todos",
        description: "Editar cualquier deal",
      },
      {
        action: "ASSIGN",
        resource: "any",
        label: "Asignar",
        description: "Asignar deals a agentes",
      },
    ],
  },
  {
    id: "REPORTS",
    name: "Reportes",
    icon: <BarChart size={18} />,
    description: "Acceso a reportes y analítica",
    permissions: [
      {
        action: "VIEW",
        resource: "basic",
        label: "Ver básicos",
        description: "Ver reportes básicos",
      },
      {
        action: "VIEW",
        resource: "advanced",
        label: "Ver avanzados",
        description: "Ver reportes avanzados",
      },
      {
        action: "EXPORT",
        resource: "any",
        label: "Exportar",
        description: "Exportar reportes",
      },
    ],
  },
  {
    id: "TEAM",
    name: "Equipo",
    icon: <Users size={18} />,
    description: "Gestión de equipo y usuarios",
    permissions: [
      {
        action: "VIEW",
        resource: "all",
        label: "Ver equipo",
        description: "Ver lista de usuarios",
      },
      {
        action: "CREATE",
        resource: "any",
        label: "Invitar",
        description: "Invitar nuevos usuarios",
      },
      {
        action: "EDIT",
        resource: "any",
        label: "Editar",
        description: "Editar usuarios",
      },
      {
        action: "DELETE",
        resource: "any",
        label: "Eliminar",
        description: "Eliminar usuarios",
      },
      {
        action: "MANAGE",
        resource: "roles",
        label: "Gestionar roles",
        description: "Asignar y gestionar roles",
      },
    ],
  },
  {
    id: "SETTINGS",
    name: "Configuración",
    icon: <Settings size={18} />,
    description: "Configuración del sistema",
    permissions: [
      {
        action: "VIEW",
        resource: "company",
        label: "Ver empresa",
        description: "Ver configuración de empresa",
      },
      {
        action: "EDIT",
        resource: "company",
        label: "Editar empresa",
        description: "Editar configuración de empresa",
      },
      {
        action: "MANAGE",
        resource: "integrations",
        label: "Integraciones",
        description: "Gestionar integraciones",
      },
      {
        action: "MANAGE",
        resource: "billing",
        label: "Facturación",
        description: "Gestionar facturación y planes",
      },
    ],
  },
  {
    id: "QUEUES",
    name: "Colas",
    icon: <List size={18} />,
    description: "Gestión de colas de atención",
    permissions: [
      {
        action: "VIEW",
        resource: "assigned",
        label: "Ver asignadas",
        description: "Ver colas asignadas",
      },
      {
        action: "VIEW",
        resource: "all",
        label: "Ver todas",
        description: "Ver todas las colas",
      },
      {
        action: "MANAGE",
        resource: "any",
        label: "Gestionar",
        description: "Gestión completa de colas",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// ️ TOGGLE SWITCH COMPONENT
// ─────────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  description?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}) => {
  return (
    <div
      className={`toggle-permission-item ${checked ? "active" : ""} ${disabled ? "disabled" : ""}`}
      onClick={!disabled ? onChange : undefined}
    >
      <div className="toggle-content">
        <span className="toggle-label">{label}</span>
        {description && (
          <span className="toggle-description">{description}</span>
        )}
      </div>
      <div className={`toggle-switch ${checked ? "on" : "off"}`}>
        <div className="toggle-track">
          <div className="toggle-thumb" />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
//  MAIN PERMISSIONS PANEL COMPONENT
// ─────────────────────────────────────────────────────────────────

export const PermissionsPanel: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"roles" | "permissions">("roles");
  const [currentUserRole, setCurrentUserRole] = useState<
    "MASTER" | "ADMIN" | "AGENT"
  >("AGENT");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );

  // Form state for new/edit role
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    baseRole: "AGENT" as "MASTER" | "ADMIN" | "AGENT",
  });

  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(),
  );

  // Load roles and current user info
  useEffect(() => {
    fetchCurrentUser();
    fetchRoles();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const data = await fetchAPI("/users/me");
      if (data?.user?.role) {
        setCurrentUserRole(data.user.role);
      }
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI("/roles");
      setRoles(data.roles || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Error cargando roles");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setIsCreating(true);
    setSelectedRole(null);
    setRoleForm({ name: "", description: "", baseRole: "AGENT" });
    setSelectedPermissions(new Set());
    // Expand all modules by default when creating
    setExpandedModules(new Set(PERMISSION_MODULES.map((m) => m.id)));
    setActiveTab("permissions");
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsCreating(false);
    setRoleForm({
      name: role.name,
      description: role.description || "",
      baseRole: role.baseRole,
    });

    // Load role permissions
    const permIds = new Set(
      role.permissions.map((p) => `${p.module}_${p.action}_${p.resource}`),
    );
    setSelectedPermissions(permIds);
    // Expand all modules by default when editing
    setExpandedModules(new Set(PERMISSION_MODULES.map((m) => m.id)));
    setActiveTab("permissions");
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error("El nombre del rol es requerido");
      return;
    }

    try {
      setLoading(true);

      const permissions = Array.from(selectedPermissions).map((permId) => {
        const [module, action, resource] = permId.split("_");
        return { module, action, resource };
      });

      if (isCreating) {
        await fetchAPI("/roles", {
          method: "POST",
          body: JSON.stringify({
            ...roleForm,
            permissions,
          }),
        });
        toast.success("Rol creado exitosamente");
      } else if (selectedRole) {
        await fetchAPI(`/roles/${selectedRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...roleForm,
            permissions,
          }),
        });
        toast.success("Rol actualizado exitosamente");
      }

      fetchRoles();
      setIsCreating(false);
      setSelectedRole(null);
      setActiveTab("roles");
    } catch (error: unknown) {
      console.error("Error saving role:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Error guardando rol";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (
      !confirm(
        "¿Ests seguro de eliminar este rol? Los usuarios con este rol perdern sus permisos personalizados.",
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await fetchAPI(`/roles/${roleId}`, { method: "DELETE" });
      toast.success("Rol eliminado exitosamente");
      fetchRoles();
    } catch (error: unknown) {
      console.error("Error deleting role:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Error eliminando rol";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = useCallback(
    (module: string, action: string, resource: string) => {
      const permId = `${module}_${action}_${resource}`;
      setSelectedPermissions((prev) => {
        const newPerms = new Set(prev);
        if (newPerms.has(permId)) {
          newPerms.delete(permId);
        } else {
          newPerms.add(permId);
        }
        return newPerms;
      });
    },
    [],
  );

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(moduleId)) {
        newExpanded.delete(moduleId);
      } else {
        newExpanded.add(moduleId);
      }
      return newExpanded;
    });
  }, []);

  const selectAllModulePermissions = (moduleId: string) => {
    const module = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!module) return;

    setSelectedPermissions((prev) => {
      const newPerms = new Set(prev);
      module.permissions.forEach((perm) => {
        newPerms.add(`${moduleId}_${perm.action}_${perm.resource}`);
      });
      return newPerms;
    });
  };

  const deselectAllModulePermissions = (moduleId: string) => {
    const module = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!module) return;

    setSelectedPermissions((prev) => {
      const newPerms = new Set(prev);
      module.permissions.forEach((perm) => {
        newPerms.delete(`${moduleId}_${perm.action}_${perm.resource}`);
      });
      return newPerms;
    });
  };

  const getModuleStats = (moduleId: string) => {
    const module = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!module) return { total: 0, selected: 0 };

    const modulePerms = module.permissions.map(
      (p) => `${moduleId}_${p.action}_${p.resource}`,
    );
    const selected = modulePerms.filter((p) =>
      selectedPermissions.has(p),
    ).length;
    return { total: modulePerms.length, selected };
  };

  return (
    <div className="permissions-panel-container">
      <div className="permissions-header">
        <div className="header-content">
          <div className="header-icon">
            <Shield size={32} className="text-white" />
          </div>
          <div>
            <h2>Gestión de Permisos</h2>
            <p className="subtitle">
              Control granular de acceso para roles personalizados
            </p>
          </div>
        </div>
        {activeTab === "roles" && (
          <button className="btn-primary" onClick={handleCreateRole}>
            <Plus size={18} />
            Crear Rol Personalizado
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="permissions-tabs">
        <button
          className={`tab ${activeTab === "roles" ? "active" : ""}`}
          onClick={() => setActiveTab("roles")}
        >
          <Users size={18} />
          Roles
        </button>
        <button
          className={`tab ${activeTab === "permissions" ? "active" : ""}`}
          onClick={() =>
            activeTab === "permissions" && !isCreating && !selectedRole
              ? setActiveTab("roles")
              : null
          }
          disabled={!isCreating && !selectedRole}
        >
          <Lock size={18} />
          Permisos
          {(isCreating || selectedRole) && (
            <span className="tab-badge">Editando</span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="permissions-content">
        {activeTab === "roles" && (
          <div className="roles-list">
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Cargando roles...</p>
              </div>
            ) : roles.length === 0 ? (
              <div className="empty-state">
                <Shield size={64} className="opacity-20 mb-4" />
                <h3>No hay roles personalizados</h3>
                <p>
                  Crea roles personalizados para gestionar permisos granulares
                </p>
                <button className="btn-primary" onClick={handleCreateRole}>
                  Crear Primer Rol
                </button>
              </div>
            ) : (
              <div className="roles-grid">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={`role-card ${!role.isActive ? "inactive" : ""}`}
                  >
                    <div className="role-card-header">
                      <div className="role-info">
                        <h3>{role.name}</h3>
                        {role.description && <p>{role.description}</p>}
                      </div>
                      <div className="role-badges">
                        {role.isSystem && (
                          <span className="badge system">Sistema</span>
                        )}
                        {!role.isActive && (
                          <span className="badge inactive">Inactivo</span>
                        )}
                        <span
                          className={`badge base-${role.baseRole.toLowerCase()}`}
                        >
                          {role.baseRole === "MASTER"
                            ? "Master"
                            : role.baseRole === "ADMIN"
                              ? "Admin"
                              : "Agente"}
                        </span>
                      </div>
                    </div>

                    <div className="role-stats">
                      <div className="stat">
                        <Users size={16} />
                        <span>{role._count?.users || 0} usuarios</span>
                      </div>
                      <div className="stat">
                        <Shield size={16} />
                        <span>{role.permissions?.length || 0} permisos</span>
                      </div>
                    </div>

                    <div className="role-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => handleEditRole(role)}
                        disabled={role.isSystem}
                      >
                        <Plus size={14} className="rotate-45" />
                        {role.isSystem ? "Ver" : "Editar"}
                      </button>
                      {!role.isSystem && (
                        <button
                          className="btn-danger"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "permissions" && (isCreating || selectedRole) && (
          <div className="permissions-editor">
            {/* Role Form */}
            <div className="role-form-section">
              <h3>Información del Rol</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nombre del Rol *</label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) =>
                      setRoleForm({ ...roleForm, name: e.target.value })
                    }
                    placeholder="ej. Agente de Ventas"
                    disabled={selectedRole?.isSystem}
                  />
                </div>
                <div className="form-group">
                  <label>Rol Base</label>
                  <select
                    value={roleForm.baseRole}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        baseRole: e.target.value as
                          | "MASTER"
                          | "ADMIN"
                          | "AGENT",
                      })
                    }
                    disabled={selectedRole?.isSystem}
                  >
                    <option value="AGENT">Agente</option>
                    {currentUserRole === "MASTER" && (
                      <option value="ADMIN">Administrador</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {currentUserRole === "ADMIN" ? (
                      <>
                         Como ADMIN, solo puedes crear roles basados en{" "}
                        <strong>Agente</strong>
                      </>
                    ) : currentUserRole === "MASTER" ? (
                      <>
                         Como MASTER, puedes crear roles basados en{" "}
                        <strong>Agente</strong> o <strong>Administrador</strong>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="form-group full-width">
                  <label>Descripción</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) =>
                      setRoleForm({ ...roleForm, description: e.target.value })
                    }
                    placeholder="Descripción del rol y sus responsabilidades"
                    rows={3}
                    disabled={selectedRole?.isSystem}
                  />
                </div>
              </div>
            </div>

            {/* Permissions Grid with Toggle Switches */}
            <div className="permissions-grid-section">
              <div className="section-header">
                <h3>Permisos del Rol</h3>
                <p className="text-sm text-gray-500">
                  Activa o desactiva los permisos utilizando los interruptores.
                  Haz clic en el módulo para expandir.
                </p>
                <div className="permissions-summary">
                  <span className="summary-badge">
                     {selectedPermissions.size} permisos seleccionados
                  </span>
                </div>
              </div>

              <div className="permissions-modules-scrollable">
                {PERMISSION_MODULES.map((module) => {
                  const stats = getModuleStats(module.id);
                  const isExpanded = expandedModules.has(module.id);
                  const allSelected =
                    stats.selected === stats.total && stats.total > 0;

                  return (
                    <div
                      key={module.id}
                      className={`permission-module-card ${isExpanded ? "expanded" : ""}`}
                    >
                      <div
                        className="module-header-clickable"
                        onClick={() => toggleModule(module.id)}
                      >
                        <div className="module-info">
                          <span className="module-icon">{module.icon}</span>
                          <div className="module-text">
                            <h4>{module.name}</h4>
                            <p>{module.description}</p>
                          </div>
                        </div>
                        <div className="module-controls">
                          <span
                            className={`permission-counter ${allSelected ? "all-selected" : stats.selected > 0 ? "partial" : ""}`}
                          >
                            {stats.selected}/{stats.total}
                          </span>
                          <button
                            className={`toggle-all-btn ${allSelected ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (allSelected) {
                                deselectAllModulePermissions(module.id);
                              } else {
                                selectAllModulePermissions(module.id);
                              }
                            }}
                            disabled={selectedRole?.isSystem}
                            title={
                              allSelected ? "Desactivar todos" : "Activar todos"
                            }
                          >
                            {allSelected ? " Todos" : "Seleccionar"}
                          </button>
                          <ChevronDown size={20} className={`expand-icon ${isExpanded ? "rotated" : ""}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="module-permissions-grid">
                          {module.permissions.map((perm) => {
                            const permId = `${module.id}_${perm.action}_${perm.resource}`;
                            const isSelected = selectedPermissions.has(permId);

                            return (
                              <ToggleSwitch
                                key={permId}
                                checked={isSelected}
                                onChange={() =>
                                  togglePermission(
                                    module.id,
                                    perm.action,
                                    perm.resource,
                                  )
                                }
                                disabled={selectedRole?.isSystem}
                                label={perm.label}
                                description={perm.description}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            {!selectedRole?.isSystem && (
              <div className="editor-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedRole(null);
                    setActiveTab("roles");
                  }}
                >
                  <X size={18} />
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSaveRole}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="spinner-small"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      {isCreating ? "Crear Rol" : "Guardar Cambios"}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PermissionsPanel;

