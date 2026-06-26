import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { fetchAPI } from "@/services/apiConfig";
import { useModal } from "@/context/ModalContext";
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
  Save,
  Trash2,
  X,
} from "lucide-react";
import "../styles/PermissionsPanel.css";

/**
 * [AUTH] PROFESSIONAL PERMISSIONS PANEL
 * Editor granular de permisos. El catálogo de módulos/permisos se obtiene del
 * backend (fuente única de verdad) — no se hardcodea en el cliente.
 */

// ─────────────────────────────────────────────────────────────────
// [SEC] TYPE DEFINITIONS (sin `any`)
// ─────────────────────────────────────────────────────────────────

type BaseRole = "MASTER" | "ADMIN" | "SUPERVISOR" | "AGENT" | "USER";

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
  baseRole: BaseRole;
  isSystem: boolean;
  isActive: boolean;
  permissions: Permission[];
  _count?: { users: number };
}

interface CatalogPermission {
  action: string;
  resource: string;
  label: string;
  description: string;
}

interface CatalogModule {
  id: string;
  name: string;
  description: string;
  permissions: CatalogPermission[];
}

// Iconos por módulo (presentacional; no provienen del API, se mapean por id).
const MODULE_ICONS: Record<string, React.ReactNode> = {
  CONVERSATIONS: <MessageSquare size={18} />,
  TICKETS: <Ticket size={18} />,
  CONTACTS: <Contact size={18} />,
  DEALS: <DollarSign size={18} />,
  REPORTS: <BarChart size={18} />,
  TEAM: <Users size={18} />,
  SETTINGS: <Settings size={18} />,
  QUEUES: <List size={18} />,
};

/** Clave canónica de un permiso (debe coincidir con el backend: module:action:resource). */
const permKey = (module: string, action: string, resource: string): string =>
  `${module}:${action}:${resource}`;

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
}) => (
  <div
    className={`toggle-permission-item ${checked ? "active" : ""} ${disabled ? "disabled" : ""}`}
    onClick={!disabled ? onChange : undefined}
  >
    <div className="toggle-content">
      <span className="toggle-label">{label}</span>
      {description && <span className="toggle-description">{description}</span>}
    </div>
    <div className={`toggle-switch ${checked ? "on" : "off"}`}>
      <div className="toggle-track">
        <div className="toggle-thumb" />
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
//  MAIN PERMISSIONS PANEL COMPONENT
// ─────────────────────────────────────────────────────────────────

export const PermissionsPanel: React.FC = () => {
  const { confirm } = useModal();
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"roles" | "permissions">("roles");
  const [currentUserRole, setCurrentUserRole] = useState<BaseRole>("AGENT");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    baseRole: BaseRole;
  }>({ name: "", description: "", baseRole: "AGENT" });

  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCurrentUser();
    fetchCatalog();
    fetchRoles();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const data = await fetchAPI<{ user: { role: BaseRole } }>("/users/me");
      if (data?.user?.role) setCurrentUserRole(data.user.role);
    } catch (error) {
      console.error("Error fetching current user:", error);
    }
  };

  const fetchCatalog = async () => {
    try {
      const data = await fetchAPI<{ catalog: CatalogModule[] }>("/roles/catalog");
      setCatalog(data.catalog || []);
    } catch (error) {
      console.error("Error fetching permission catalog:", error);
      toast.error("Error al cargar el catálogo de permisos");
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<{ roles: Role[] }>("/roles");
      setRoles(data.roles || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Error al cargar roles");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setIsCreating(true);
    setSelectedRole(null);
    setRoleForm({ name: "", description: "", baseRole: "AGENT" });
    setSelectedPermissions(new Set());
    setExpandedModules(new Set(catalog.map((m) => m.id)));
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
    setSelectedPermissions(
      new Set(role.permissions.map((p) => permKey(p.module, p.action, p.resource))),
    );
    setExpandedModules(new Set(catalog.map((m) => m.id)));
    setActiveTab("permissions");
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error("Nombre del rol requerido");
      return;
    }

    try {
      setLoading(true);

      const permissions = Array.from(selectedPermissions).map((key) => {
        const [module, action, resource] = key.split(":");
        return { module, action, resource };
      });

      if (isCreating) {
        await fetchAPI("/roles", {
          method: "POST",
          body: JSON.stringify({ ...roleForm, permissions }),
        });
        toast.success("Rol creado");
      } else if (selectedRole) {
        await fetchAPI(`/roles/${selectedRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...roleForm, permissions }),
        });
        toast.success("Rol actualizado");
      }

      fetchRoles();
      setIsCreating(false);
      setSelectedRole(null);
      setActiveTab("roles");
    } catch (error: unknown) {
      console.error("Error saving role:", error);
      toast.error(error instanceof Error ? error.message : "Error guardando rol");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const ok = await confirm({
      title: "Eliminar rol",
      message:
        "¿Estás seguro de eliminar este rol? Los usuarios con este rol perderán sus permisos personalizados.",
      confirmText: "Eliminar rol",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    try {
      setLoading(true);
      await fetchAPI(`/roles/${roleId}`, { method: "DELETE" });
      toast.success("Rol eliminado");
      fetchRoles();
    } catch (error: unknown) {
      console.error("Error deleting role:", error);
      toast.error(error instanceof Error ? error.message : "Error eliminando rol");
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = useCallback(
    (module: string, action: string, resource: string) => {
      const key = permKey(module, action, resource);
      setSelectedPermissions((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const setModulePermissions = useCallback(
    (moduleId: string, enabled: boolean) => {
      const module = catalog.find((m) => m.id === moduleId);
      if (!module) return;
      setSelectedPermissions((prev) => {
        const next = new Set(prev);
        module.permissions.forEach((perm) => {
          const key = permKey(moduleId, perm.action, perm.resource);
          if (enabled) next.add(key);
          else next.delete(key);
        });
        return next;
      });
    },
    [catalog],
  );

  const getModuleStats = (moduleId: string) => {
    const module = catalog.find((m) => m.id === moduleId);
    if (!module) return { total: 0, selected: 0 };
    const keys = module.permissions.map((p) => permKey(moduleId, p.action, p.resource));
    return {
      total: keys.length,
      selected: keys.filter((k) => selectedPermissions.has(k)).length,
    };
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
            <p className="subtitle">Control granular de acceso para roles personalizados</p>
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
          {(isCreating || selectedRole) && <span className="tab-badge">Editando</span>}
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
                <p>Crea roles personalizados para gestionar permisos granulares</p>
                <button className="btn-primary" onClick={handleCreateRole}>
                  Crear Primer Rol
                </button>
              </div>
            ) : (
              <div className="roles-grid">
                {roles.map((role) => (
                  <div key={role.id} className={`role-card ${!role.isActive ? "inactive" : ""}`}>
                    <div className="role-card-header">
                      <div className="role-info">
                        <h3>{role.name}</h3>
                        {role.description && <p>{role.description}</p>}
                      </div>
                      <div className="role-badges">
                        {role.isSystem && <span className="badge system">Sistema</span>}
                        {!role.isActive && <span className="badge inactive">Inactivo</span>}
                        <span className={`badge base-${role.baseRole.toLowerCase()}`}>
                          {role.baseRole === "MASTER"
                            ? "Master"
                            : role.baseRole === "ADMIN"
                              ? "Admin"
                              : role.baseRole === "SUPERVISOR"
                                ? "Supervisor"
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
                        <button className="btn-danger" onClick={() => handleDeleteRole(role.id)}>
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
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="ej. Agente de Ventas"
                    disabled={selectedRole?.isSystem}
                  />
                </div>
                <div className="form-group">
                  <label>Rol Base</label>
                  <select
                    value={roleForm.baseRole}
                    onChange={(e) =>
                      setRoleForm({ ...roleForm, baseRole: e.target.value as BaseRole })
                    }
                    disabled={selectedRole?.isSystem}
                  >
                    <option value="AGENT">Agente</option>
                    {currentUserRole === "MASTER" && <option value="ADMIN">Administrador</option>}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {currentUserRole === "ADMIN" ? (
                      <>
                        Como ADMIN, solo puedes crear roles basados en <strong>Agente</strong>
                      </>
                    ) : currentUserRole === "MASTER" ? (
                      <>
                        Como MASTER, puedes crear roles basados en <strong>Agente</strong> o{" "}
                        <strong>Administrador</strong>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="form-group full-width">
                  <label>Descripción</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
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
                  Activa o desactiva los permisos utilizando los interruptores. Haz clic en el
                  módulo para expandir.
                </p>
                <div className="permissions-summary">
                  <span className="summary-badge">
                    {selectedPermissions.size} permisos seleccionados
                  </span>
                </div>
              </div>

              <div className="permissions-modules-scrollable">
                {catalog.map((module) => {
                  const stats = getModuleStats(module.id);
                  const isExpanded = expandedModules.has(module.id);
                  const allSelected = stats.selected === stats.total && stats.total > 0;

                  return (
                    <div
                      key={module.id}
                      className={`permission-module-card ${isExpanded ? "expanded" : ""}`}
                    >
                      <div className="module-header-clickable" onClick={() => toggleModule(module.id)}>
                        <div className="module-info">
                          <span className="module-icon">{MODULE_ICONS[module.id] ?? <Lock size={18} />}</span>
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
                              setModulePermissions(module.id, !allSelected);
                            }}
                            disabled={selectedRole?.isSystem}
                            title={allSelected ? "Desactivar todos" : "Activar todos"}
                          >
                            {allSelected ? "Todos" : "Seleccionar"}
                          </button>
                          <ChevronDown size={20} className={`expand-icon ${isExpanded ? "rotated" : ""}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="module-permissions-grid">
                          {module.permissions.map((perm) => {
                            const key = permKey(module.id, perm.action, perm.resource);
                            return (
                              <ToggleSwitch
                                key={key}
                                checked={selectedPermissions.has(key)}
                                onChange={() => togglePermission(module.id, perm.action, perm.resource)}
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
                <button className="btn-primary" onClick={handleSaveRole} disabled={loading}>
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
