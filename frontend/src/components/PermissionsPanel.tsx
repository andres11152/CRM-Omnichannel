import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  Pencil,
  Eye,
  Check,
} from "lucide-react";

/**
 * [AUTH] PERMISSIONS PANEL — Editor enterprise de Roles y Permisos.
 * Catálogo desde el backend (fuente única). UI con el design system Tailwind
 * de la app (sin CSS custom).
 */

// ─────────────────────────────────────────────────────────────────
// TIPOS (sin `any`)
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

const BASE_ROLE_LABEL: Record<BaseRole, string> = {
  MASTER: "Master",
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  AGENT: "Agente",
  USER: "Usuario",
};

const BASE_ROLE_BADGE: Record<BaseRole, string> = {
  MASTER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SUPERVISOR: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  AGENT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  USER: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

/** Clave canónica de un permiso (coincide con el backend: module:action:resource). */
const permKey = (module: string, action: string, resource: string): string =>
  `${module}:${action}:${resource}`;

// ─────────────────────────────────────────────────────────────────
// TOGGLE SWITCH (accesible)
// ─────────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-reply-brand/40 ${
      checked ? "bg-reply-brand" : "bg-gray-300 dark:bg-gray-600"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
        checked ? "translate-x-5" : "translate-x-0.5"
      }`}
    />
  </button>
);

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export const PermissionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"roles" | "permissions">("roles");
  const [currentUserRole, setCurrentUserRole] = useState<BaseRole>("AGENT");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const [roleForm, setRoleForm] = useState<{ name: string; description: string; baseRole: BaseRole }>(
    { name: "", description: "", baseRole: "AGENT" },
  );
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const isReadOnly = !!selectedRole?.isSystem;

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
      toast.error(t("permissions_panel.toast.catalog_load_error", "Error al cargar el catálogo de permisos"));
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<{ roles: Role[] }>("/roles");
      setRoles(data.roles || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error(t("permissions_panel.toast.roles_load_error", "Error al cargar roles"));
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
    setRoleForm({ name: role.name, description: role.description || "", baseRole: role.baseRole });
    setSelectedPermissions(
      new Set(role.permissions.map((p) => permKey(p.module, p.action, p.resource))),
    );
    setExpandedModules(new Set(catalog.map((m) => m.id)));
    setActiveTab("permissions");
  };

  const closeEditor = () => {
    setIsCreating(false);
    setSelectedRole(null);
    setActiveTab("roles");
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error(t("permissions_panel.toast.name_required", "Nombre del rol requerido"));
      return;
    }
    try {
      setLoading(true);
      const permissions = Array.from(selectedPermissions).map((key) => {
        const [module, action, resource] = key.split(":");
        return { module, action, resource };
      });

      if (isCreating) {
        await fetchAPI("/roles", { method: "POST", body: JSON.stringify({ ...roleForm, permissions }) });
        toast.success(t("permissions_panel.toast.role_created", "Rol creado"));
      } else if (selectedRole) {
        await fetchAPI(`/roles/${selectedRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...roleForm, permissions }),
        });
        toast.success(t("permissions_panel.toast.role_updated", "Rol actualizado"));
      }
      fetchRoles();
      closeEditor();
    } catch (error: unknown) {
      console.error("Error saving role:", error);
      toast.error(error instanceof Error ? error.message : t("permissions_panel.toast.save_error", "Error guardando rol"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const ok = await confirm({
      title: t("permissions_panel.confirm.delete_role_title", "Eliminar rol"),
      message: t("permissions_panel.confirm.delete_role_message", "¿Estás seguro de eliminar este rol? Los usuarios con este rol perderán sus permisos personalizados."),
      confirmText: t("permissions_panel.confirm.delete_role_cta", "Eliminar rol"),
      cancelText: t("common.cancel", "Cancelar"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      setLoading(true);
      await fetchAPI(`/roles/${roleId}`, { method: "DELETE" });
      toast.success(t("permissions_panel.toast.role_deleted", "Rol eliminado"));
      fetchRoles();
    } catch (error: unknown) {
      console.error("Error deleting role:", error);
      toast.error(error instanceof Error ? error.message : t("permissions_panel.toast.delete_error", "Error eliminando rol"));
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = useCallback((module: string, action: string, resource: string) => {
    const key = permKey(module, action, resource);
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
    return { total: keys.length, selected: keys.filter((k) => selectedPermissions.has(k)).length };
  };

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-reply-brand/30 focus:border-reply-brand outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-reply-brand/10 flex items-center justify-center text-reply-brand shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gestión de Permisos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Control granular de acceso para roles personalizados
            </p>
          </div>
        </div>
        {activeTab === "roles" && (
          <button
            onClick={handleCreateRole}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-reply-brand hover:bg-reply-brand-dark text-white font-bold text-sm shadow-lg shadow-reply-brand/30 transition-all active:scale-95 shrink-0"
          >
            <Plus size={18} />
            Crear Rol Personalizado
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-gray-100 dark:bg-reply-surface-dark rounded-xl mb-6 w-full sm:w-auto sm:inline-flex">
        <button
          onClick={() => setActiveTab("roles")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === "roles"
              ? "bg-white dark:bg-reply-panel-dark text-reply-brand shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <Users size={18} />
          Roles
        </button>
        <button
          onClick={() =>
            activeTab === "permissions" && !isCreating && !selectedRole ? setActiveTab("roles") : null
          }
          disabled={!isCreating && !selectedRole}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === "permissions"
              ? "bg-white dark:bg-reply-panel-dark text-reply-brand shadow-sm"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <Lock size={18} />
          Permisos
          {(isCreating || selectedRole) && (
            <span className="ml-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-reply-brand/15 text-reply-brand">
              Editando
            </span>
          )}
        </button>
      </div>

      {/* ─── ROLES TAB ─── */}
      {activeTab === "roles" && (
        <>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-10 h-10 border-4 border-reply-brand/20 border-t-reply-brand rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium">Cargando roles...</p>
            </div>
          ) : roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Shield size={56} className="text-gray-300 dark:text-gray-700 mb-4" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">No hay roles personalizados</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6 max-w-sm">
                Crea roles personalizados para gestionar permisos granulares de tu equipo.
              </p>
              <button
                onClick={handleCreateRole}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-reply-brand hover:bg-reply-brand-dark text-white font-bold text-sm shadow-lg shadow-reply-brand/30 transition-all active:scale-95"
              >
                <Plus size={18} />
                Crear Primer Rol
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`flex flex-col rounded-2xl border border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark p-5 transition-all hover:shadow-md ${
                    !role.isActive ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{role.name}</h3>
                      {role.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${BASE_ROLE_BADGE[role.baseRole]}`}
                    >
                      {BASE_ROLE_LABEL[role.baseRole]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-5">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={14} />
                      {role._count?.users || 0} usuarios
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Shield size={14} />
                      {role.permissions?.length || 0} permisos
                    </span>
                    {role.isSystem && (
                      <span className="ml-auto text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Sistema
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => handleEditRole(role)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-reply-border-dark text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-gray-50 dark:hover:bg-reply-surface-dark transition-colors"
                    >
                      {role.isSystem ? <Eye size={14} /> : <Pencil size={14} />}
                      {role.isSystem ? "Ver" : "Editar"}
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
        </>
      )}

      {/* ─── PERMISSIONS EDITOR ─── */}
      {activeTab === "permissions" && (isCreating || selectedRole) && (
        <div className="space-y-6">
          {/* Role Form */}
          <div className="rounded-2xl border border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-5">
              Información del Rol
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                  Nombre del Rol <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="ej. Agente de Ventas"
                  disabled={isReadOnly}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                  Rol Base
                </label>
                <select
                  value={roleForm.baseRole}
                  onChange={(e) => setRoleForm({ ...roleForm, baseRole: e.target.value as BaseRole })}
                  disabled={isReadOnly}
                  className={inputCls}
                >
                  <option value="AGENT">Agente</option>
                  {currentUserRole === "MASTER" && <option value="ADMIN">Administrador</option>}
                </select>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {currentUserRole === "ADMIN" ? (
                    <>Como ADMIN, solo puedes crear roles basados en <strong>Agente</strong></>
                  ) : currentUserRole === "MASTER" ? (
                    <>Como MASTER, puedes basarlos en <strong>Agente</strong> o <strong>Administrador</strong></>
                  ) : null}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Descripción del rol y sus responsabilidades"
                  rows={2}
                  disabled={isReadOnly}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div className="rounded-2xl border border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Permisos del Rol</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Activa los permisos con los interruptores. Clic en el módulo para expandir.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-reply-brand/10 text-reply-brand">
                <Check size={14} />
                {selectedPermissions.size} seleccionados
              </span>
            </div>

            <div className="space-y-3">
              {catalog.map((module) => {
                const stats = getModuleStats(module.id);
                const isExpanded = expandedModules.has(module.id);
                const allSelected = stats.selected === stats.total && stats.total > 0;

                return (
                  <div
                    key={module.id}
                    className="rounded-xl border border-gray-200 dark:border-reply-border-dark overflow-hidden"
                  >
                    {/* Module header */}
                    <div
                      onClick={() => toggleModule(module.id)}
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-reply-surface-dark/50 transition-colors"
                    >
                      <span className="w-9 h-9 rounded-lg bg-reply-brand/10 text-reply-brand flex items-center justify-center shrink-0">
                        {MODULE_ICONS[module.id] ?? <Lock size={18} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {module.name}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {module.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold tabular-nums px-2 py-0.5 rounded-md ${
                          allSelected
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : stats.selected > 0
                              ? "bg-reply-brand/10 text-reply-brand"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                        }`}
                      >
                        {stats.selected}/{stats.total}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModulePermissions(module.id, !allSelected);
                        }}
                        disabled={isReadOnly}
                        className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-gray-200 dark:border-reply-border-dark text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {allSelected ? "Quitar todos" : "Todos"}
                      </button>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>

                    {/* Module permissions */}
                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 pt-0 bg-gray-50/50 dark:bg-reply-surface-dark/30">
                        {module.permissions.map((perm) => {
                          const key = permKey(module.id, perm.action, perm.resource);
                          const checked = selectedPermissions.has(key);
                          return (
                            <div
                              key={key}
                              onClick={() =>
                                !isReadOnly && togglePermission(module.id, perm.action, perm.resource)
                              }
                              className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                                isReadOnly ? "cursor-not-allowed" : "cursor-pointer"
                              } ${
                                checked
                                  ? "border-reply-brand/40 bg-reply-brand/5"
                                  : "border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-panel-dark hover:border-gray-300 dark:hover:border-gray-600"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                                  {perm.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {perm.description}
                                </p>
                              </div>
                              <ToggleSwitch
                                checked={checked}
                                disabled={isReadOnly}
                                onChange={() =>
                                  togglePermission(module.id, perm.action, perm.resource)
                                }
                              />
                            </div>
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
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeEditor}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-reply-surface-dark transition-colors"
            >
              <X size={18} />
              Cancelar
            </button>
            {!isReadOnly && (
              <button
                onClick={handleSaveRole}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-reply-brand hover:bg-reply-brand-dark text-white font-bold text-sm shadow-lg shadow-reply-brand/30 transition-all active:scale-95 disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {isCreating ? "Crear Rol" : "Guardar Cambios"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionsPanel;
