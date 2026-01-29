import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { fetchAPI } from '../services/apiConfig';
import '../src/styles/PermissionsPanel.css';

/**
 * 🔐 PROFESSIONAL PERMISSIONS PANEL
 * Granular permission management for agents and custom roles
 */

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
  baseRole: 'MASTER' | 'ADMIN' | 'AGENT';
  isSystem: boolean;
  isActive: boolean;
  permissions: Permission[];
  _count?: {
    users: number;
  };
}

interface PermissionModule {
  id: string;
  name: string;
  icon: string;
  description: string;
  permissions: {
    action: string;
    resource: string;
    label: string;
    description: string;
  }[];
}

// Permission modules definition based on CRM features
const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: 'CONVERSATIONS',
    name: 'Conversaciones',
    icon: '💬',
    description: 'Gestión de conversaciones y mensajería',
    permissions: [
      { action: 'VIEW', resource: 'own', label: 'Ver propias', description: 'Ver solo conversaciones asignadas' },
      { action: 'VIEW', resource: 'team', label: 'Ver del equipo', description: 'Ver conversaciones del equipo' },
      { action: 'VIEW', resource: 'all', label: 'Ver todas', description: 'Ver todas las conversaciones' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Iniciar nuevas conversaciones' },
      { action: 'EDIT', resource: 'own', label: 'Editar propias', description: 'Editar conversaciones asignadas' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propias', description: 'Eliminar conversaciones propias' },
      { action: 'ASSIGN', resource: 'any', label: 'Asignar', description: 'Asignar conversaciones a agentes' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar historial de conversaciones' },
    ],
  },
  {
    id: 'TICKETS',
    name: 'Tickets',
    icon: '🎫',
    description: 'Gestión de tickets de soporte',
    permissions: [
      { action: 'VIEW', resource: 'own', label: 'Ver propios', description: 'Ver solo tickets asignados' },
      { action: 'VIEW', resource: 'queue', label: 'Ver cola', description: 'Ver tickets en cola' },
      { action: 'VIEW', resource: 'all', label: 'Ver todos', description: 'Ver todos los tickets' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevos tickets' },
      { action: 'EDIT', resource: 'own', label: 'Editar propios', description: 'Editar tickets asignados' },
      { action: 'EDIT', resource: 'all', label: 'Editar todos', description: 'Editar cualquier ticket' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propios', description: 'Eliminar tickets propios' },
      { action: 'DELETE', resource: 'all', label: 'Eliminar todos', description: 'Eliminar cualquier ticket' },
      { action: 'ASSIGN', resource: 'any', label: 'Asignar', description: 'Asignar tickets a agentes' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar tickets' },
    ],
  },
  {
    id: 'CONTACTS',
    name: 'Contactos',
    icon: '👥',
    description: 'Gestión de contactos y clientes',
    permissions: [
      { action: 'VIEW', resource: 'own', label: 'Ver propios', description: 'Ver contactos creados por uno' },
      { action: 'VIEW', resource: 'all', label: 'Ver todos', description: 'Ver todos los contactos' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevos contactos' },
      { action: 'EDIT', resource: 'own', label: 'Editar propios', description: 'Editar contactos propios' },
      { action: 'EDIT', resource: 'all', label: 'Editar todos', description: 'Editar cualquier contacto' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propios', description: 'Eliminar contactos propios' },
      { action: 'DELETE', resource: 'all', label: 'Eliminar todos', description: 'Eliminar cualquier contacto' },
      { action: 'IMPORT', resource: 'any', label: 'Importar', description: 'Importar contactos desde CSV' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar contactos' },
    ],
  },
  {
    id: 'DEALS',
    name: 'Deals / Ventas',
    icon: '💰',
    description: 'Gestión de oportunidades de venta',
    permissions: [
      { action: 'VIEW', resource: 'own', label: 'Ver propios', description: 'Ver deals asignados' },
      { action: 'VIEW', resource: 'team', label: 'Ver del equipo', description: 'Ver deals del equipo' },
      { action: 'VIEW', resource: 'all', label: 'Ver todos', description: 'Ver todos los deals' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevos deals' },
      { action: 'EDIT', resource: 'own', label: 'Editar propios', description: 'Editar deals asignados' },
      { action: 'EDIT', resource: 'all', label: 'Editar todos', description: 'Editar cualquier deal' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propios', description: 'Eliminar deals propios' },
      { action: 'DELETE', resource: 'all', label: 'Eliminar todos', description: 'Eliminar cualquier deal' },
      { action: 'ASSIGN', resource: 'any', label: 'Asignar', description: 'Asignar deals a agentes' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar deals' },
    ],
  },
  {
    id: 'ACTIVITIES',
    name: 'Actividades',
    icon: '📅',
    description: 'Gestión de actividades y tareas',
    permissions: [
      { action: 'VIEW', resource: 'own', label: 'Ver propias', description: 'Ver actividades asignadas' },
      { action: 'VIEW', resource: 'all', label: 'Ver todas', description: 'Ver todas las actividades' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevas actividades' },
      { action: 'EDIT', resource: 'own', label: 'Editar propias', description: 'Editar actividades asignadas' },
      { action: 'EDIT', resource: 'all', label: 'Editar todas', description: 'Editar cualquier actividad' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propias', description: 'Eliminar actividades propias' },
      { action: 'DELETE', resource: 'all', label: 'Eliminar todas', description: 'Eliminar cualquier actividad' },
    ],
  },
  {
    id: 'CAMPAIGNS',
    name: 'Campañas',
    icon: '📢',
    description: 'Gestión de campañas de marketing',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver', description: 'Ver campañas' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevas campañas' },
      { action: 'EDIT', resource: 'any', label: 'Editar', description: 'Editar campañas' },
      { action: 'DELETE', resource: 'any', label: 'Eliminar', description: 'Eliminar campañas' },
      { action: 'MANAGE', resource: 'any', label: 'Gestionar', description: 'Gestión completa de campañas' },
    ],
  },
  {
    id: 'REPORTS',
    name: 'Reportes',
    icon: '📊',
    description: 'Acceso a reportes y analítica',
    permissions: [
      { action: 'VIEW', resource: 'basic', label: 'Ver básicos', description: 'Ver reportes básicos' },
      { action: 'VIEW', resource: 'advanced', label: 'Ver avanzados', description: 'Ver reportes avanzados' },
      { action: 'VIEW', resource: 'financial', label: 'Ver financieros', description: 'Ver reportes financieros' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar reportes' },
      { action: 'CREATE', resource: 'custom', label: 'Crear personalizados', description: 'Crear reportes personalizados' },
    ],
  },
  {
    id: 'TEAM',
    name: 'Equipo',
    icon: '👨‍💼',
    description: 'Gestión de equipo y usuarios',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver equipo', description: 'Ver lista de usuarios' },
      { action: 'CREATE', resource: 'any', label: 'Invitar', description: 'Invitar nuevos usuarios' },
      { action: 'EDIT', resource: 'any', label: 'Editar', description: 'Editar usuarios' },
      { action: 'DELETE', resource: 'any', label: 'Eliminar', description: 'Eliminar usuarios' },
      { action: 'MANAGE', resource: 'roles', label: 'Gestionar roles', description: 'Asignar y gestionar roles' },
    ],
  },
  {
    id: 'SETTINGS',
    name: 'Configuración',
    icon: '⚙️',
    description: 'Configuración del sistema',
    permissions: [
      { action: 'VIEW', resource: 'company', label: 'Ver empresa', description: 'Ver configuración de empresa' },
      { action: 'EDIT', resource: 'company', label: 'Editar empresa', description: 'Editar configuración de empresa' },
      { action: 'VIEW', resource: 'integrations', label: 'Ver integraciones', description: 'Ver integraciones' },
      { action: 'MANAGE', resource: 'integrations', label: 'Gestionar integraciones', description: 'Gestionar integraciones' },
      { action: 'MANAGE', resource: 'billing', label: 'Gestionar facturación', description: 'Gestionar facturación y planes' },
    ],
  },
  {
    id: 'INTEGRATIONS',
    name: 'Integraciones',
    icon: '🔌',
    description: 'Gestión de integraciones',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver', description: 'Ver integraciones' },
      { action: 'CREATE', resource: 'any', label: 'Conectar', description: 'Conectar nuevas integraciones' },
      { action: 'EDIT', resource: 'any', label: 'Configurar', description: 'Configurar integraciones' },
      { action: 'DELETE', resource: 'any', label: 'Desconectar', description: 'Desconectar integraciones' },
    ],
  },
  {
    id: 'MEDIA',
    name: 'Biblioteca Multimedia',
    icon: '🖼️',
    description: 'Gestión de archivos multimedia',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver', description: 'Ver biblioteca multimedia' },
      { action: 'CREATE', resource: 'any', label: 'Subir', description: 'Subir archivos' },
      { action: 'DELETE', resource: 'own', label: 'Eliminar propios', description: 'Eliminar archivos propios' },
      { action: 'DELETE', resource: 'all', label: 'Eliminar todos', description: 'Eliminar cualquier archivo' },
    ],
  },
  {
    id: 'FLOWS',
    name: 'Chatbot Flows',
    icon: '🤖',
    description: 'Gestión de flujos de chatbot',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver', description: 'Ver flows' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear nuevos flows' },
      { action: 'EDIT', resource: 'any', label: 'Editar', description: 'Editar flows' },
      { action: 'DELETE', resource: 'any', label: 'Eliminar', description: 'Eliminar flows' },
      { action: 'MANAGE', resource: 'any', label: 'Gestionar', description: 'Activar/desactivar flows' },
    ],
  },
  {
    id: 'PRODUCTS',
    name: 'Productos',
    icon: '📦',
    description: 'Gestión de catálogo de productos',
    permissions: [
      { action: 'VIEW', resource: 'all', label: 'Ver', description: 'Ver catálogo' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear productos' },
      { action: 'EDIT', resource: 'any', label: 'Editar', description: 'Editar productos' },
      { action: 'DELETE', resource: 'any', label: 'Eliminar', description: 'Eliminar productos' },
      { action: 'IMPORT', resource: 'any', label: 'Importar', description: 'Importar productos' },
      { action: 'EXPORT', resource: 'any', label: 'Exportar', description: 'Exportar productos' },
    ],
  },
  {
    id: 'QUEUES',
    name: 'Colas',
    icon: '📋',
    description: 'Gestión de colas de atención',
    permissions: [
      { action: 'VIEW', resource: 'assigned', label: 'Ver asignadas', description: 'Ver colas asignadas' },
      { action: 'VIEW', resource: 'all', label: 'Ver todas', description: 'Ver todas las colas' },
      { action: 'CREATE', resource: 'any', label: 'Crear', description: 'Crear colas' },
      { action: 'EDIT', resource: 'any', label: 'Editar', description: 'Editar colas' },
      { action: 'DELETE', resource: 'any', label: 'Eliminar', description: 'Eliminar colas' },
      { action: 'MANAGE', resource: 'any', label: 'Gestionar', description: 'Gestión completa de colas' },
    ],
  },
];

export const PermissionsPanel: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles');
  const [currentUserRole, setCurrentUserRole] = useState<'MASTER' | 'ADMIN' | 'AGENT'>('AGENT');

  // Form state for new/edit role
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    baseRole: 'AGENT' as 'MASTER' | 'ADMIN' | 'AGENT',
  });

  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  // Load roles and current user info
  useEffect(() => {
    fetchCurrentUser();
    fetchRoles();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const data = await fetchAPI('/users/me');
      if (data?.user?.role) {
        setCurrentUserRole(data.user.role);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI('/roles');
      setRoles(data.roles || []);
    } catch (error) {
      console.error('Error fetching roles:', error);
      toast.error('Error cargando roles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = () => {
    setIsCreating(true);
    setSelectedRole(null);
    setRoleForm({ name: '', description: '', baseRole: 'AGENT' });
    setSelectedPermissions(new Set());
    setActiveTab('permissions');
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsCreating(false);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      baseRole: role.baseRole,
    });
    
    // Load role permissions
    const permIds = new Set(role.permissions.map(p => `${p.module}_${p.action}_${p.resource}`));
    setSelectedPermissions(permIds);
    setActiveTab('permissions');
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error('El nombre del rol es requerido');
      return;
    }

    try {
      setLoading(true);
      
      const permissions = Array.from(selectedPermissions).map(permId => {
        const [module, action, resource] = permId.split('_');
        return { module, action, resource };
      });

      if (isCreating) {
        await fetchAPI('/roles', {
          method: 'POST',
          body: JSON.stringify({
            ...roleForm,
            permissions,
          }),
        });
        toast.success('Rol creado exitosamente');
      } else if (selectedRole) {
        await fetchAPI(`/roles/${selectedRole.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...roleForm,
            permissions,
          }),
        });
        toast.success('Rol actualizado exitosamente');
      }

      fetchRoles();
      setIsCreating(false);
      setSelectedRole(null);
      setActiveTab('roles');
    } catch (error: any) {
      console.error('Error saving role:', error);
      toast.error(error.message || 'Error guardando rol');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('¿Estás seguro de eliminar este rol? Los usuarios con este rol perderán sus permisos personalizados.')) {
      return;
    }

    try {
      setLoading(true);
      await fetchAPI(`/roles/${roleId}`, { method: 'DELETE' });
      toast.success('Rol eliminado exitosamente');
      fetchRoles();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      toast.error(error.message || 'Error eliminando rol');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (module: string, action: string, resource: string) => {
    const permId = `${module}_${action}_${resource}`;
    const newPerms = new Set(selectedPermissions);
    
    if (newPerms.has(permId)) {
      newPerms.delete(permId);
    } else {
      newPerms.add(permId);
    }
    
    setSelectedPermissions(newPerms);
  };

  const selectAllModulePermissions = (moduleId: string) => {
    const module = PERMISSION_MODULES.find(m => m.id === moduleId);
    if (!module) return;

    const newPerms = new Set(selectedPermissions);
    module.permissions.forEach(perm => {
      newPerms.add(`${moduleId}_${perm.action}_${perm.resource}`);
    });
    setSelectedPermissions(newPerms);
  };

  const deselectAllModulePermissions = (moduleId: string) => {
    const module = PERMISSION_MODULES.find(m => m.id === moduleId);
    if (!module) return;

    const newPerms = new Set(selectedPermissions);
    module.permissions.forEach(perm => {
      newPerms.delete(`${moduleId}_${perm.action}_${perm.resource}`);
    });
    setSelectedPermissions(newPerms);
  };

  return (
    <div className="permissions-panel-container">
      <div className="permissions-header">
        <div className="header-content">
          <div className="header-icon">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2>Gestión de Permisos</h2>
            <p className="subtitle">Control granular de acceso para roles personalizados</p>
          </div>
        </div>
        {activeTab === 'roles' && (
          <button className="btn-primary" onClick={handleCreateRole}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear Rol Personalizado
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="permissions-tabs">
        <button
          className={`tab ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Roles
        </button>
        <button
          className={`tab ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() => activeTab === 'permissions' && !isCreating && !selectedRole ? setActiveTab('roles') : null}
          disabled={!isCreating && !selectedRole}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Permisos
          {(isCreating || selectedRole) && <span className="tab-badge">Editando</span>}
        </button>
      </div>

      {/* Content */}
      <div className="permissions-content">
        {activeTab === 'roles' && (
          <div className="roles-list">
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Cargando roles...</p>
              </div>
            ) : roles.length === 0 ? (
              <div className="empty-state">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3>No hay roles personalizados</h3>
                <p>Crea roles personalizados para gestionar permisos granulares</p>
                <button className="btn-primary" onClick={handleCreateRole}>
                  Crear Primer Rol
                </button>
              </div>
            ) : (
              <div className="roles-grid">
                {roles.map((role) => (
                  <div key={role.id} className={`role-card ${!role.isActive ? 'inactive' : ''}`}>
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
                        <span className={`badge base-${role.baseRole.toLowerCase()}`}>
                          {role.baseRole === 'MASTER' ? 'Master' : role.baseRole === 'ADMIN' ? 'Admin' : 'Agente'}
                        </span>
                      </div>
                    </div>

                    <div className="role-stats">
                      <div className="stat">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span>{role._count?.users || 0} usuarios</span>
                      </div>
                      <div className="stat">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>{role.permissions?.length || 0} permisos</span>
                      </div>
                    </div>

                    <div className="role-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => handleEditRole(role)}
                        disabled={role.isSystem}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {role.isSystem ? 'Ver' : 'Editar'}
                      </button>
                      {!role.isSystem && (
                        <button
                          className="btn-danger"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
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

        {activeTab === 'permissions' && (isCreating || selectedRole) && (
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
                    onChange={(e) => setRoleForm({ ...roleForm, baseRole: e.target.value as any })}
                    disabled={selectedRole?.isSystem}
                  >
                    <option value="AGENT">Agente</option>
                    {/* Only MASTER can create roles with ADMIN base */}
                    {currentUserRole === 'MASTER' && (
                      <option value="ADMIN">Administrador</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {currentUserRole === 'ADMIN' ? (
                      <>
                        💡 Como ADMIN, solo puedes crear roles basados en <strong>Agente</strong>
                      </>
                    ) : currentUserRole === 'MASTER' ? (
                      <>
                        💡 Como MASTER, puedes crear roles basados en <strong>Agente</strong> o <strong>Administrador</strong>
                      </>
                    ) : (
                      <>
                        💡 El rol MASTER está reservado solo para administradores del sistema
                      </>
                    )}
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

            {/* Permissions Grid */}
            <div className="permissions-grid-section">
              <div className="section-header">
                <h3>Permisos del Rol</h3>
                <p className="text-sm text-gray-500">
                  Selecciona los permisos que tendrá este rol. Los permisos se agrupan por módulo.
                </p>
              </div>

              <div className="permissions-modules">
                {PERMISSION_MODULES.map((module) => {
                  const modulePerms = module.permissions.map(p => `${module.id}_${p.action}_${p.resource}`);
                  const selectedCount = modulePerms.filter(p => selectedPermissions.has(p)).length;
                  const allSelected = selectedCount === modulePerms.length;

                  return (
                    <div key={module.id} className="permission-module">
                      <div className="module-header">
                        <div className="module-info">
                          <span className="module-icon">{module.icon}</span>
                          <div>
                            <h4>{module.name}</h4>
                            <p>{module.description}</p>
                          </div>
                        </div>
                        <div className="module-actions">
                          <span className="selected-count">
                            {selectedCount}/{modulePerms.length}
                          </span>
                          {allSelected ? (
                            <button
                              className="btn-link"
                              onClick={() => deselectAllModulePermissions(module.id)}
                              disabled={selectedRole?.isSystem}
                            >
                              Deseleccionar todos
                            </button>
                          ) : (
                            <button
                              className="btn-link"
                              onClick={() => selectAllModulePermissions(module.id)}
                              disabled={selectedRole?.isSystem}
                            >
                              Seleccionar todos
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="permissions-list">
                        {module.permissions.map((perm) => {
                          const permId = `${module.id}_${perm.action}_${perm.resource}`;
                          const isSelected = selectedPermissions.has(permId);

                          return (
                            <div key={permId} className="permission-item">
                              <label className="permission-checkbox">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePermission(module.id, perm.action, perm.resource)}
                                  disabled={selectedRole?.isSystem}
                                />
                                <div className="permission-info">
                                  <span className="permission-label">{perm.label}</span>
                                  <span className="permission-description">{perm.description}</span>
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
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
                    setActiveTab('roles');
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
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
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {isCreating ? 'Crear Rol' : 'Guardar Cambios'}
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
