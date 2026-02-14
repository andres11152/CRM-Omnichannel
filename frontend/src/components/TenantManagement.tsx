import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner"; // New Import
import { Company, CompanyStatus, Plan } from "@/types";
import { adminService } from "@/services/adminService";
import { API_BASE_URL } from "@/services/apiConfig";
import { AdminTenantTable } from "./AdminTenantTable";
import { ModuleHeader } from "./common/ModuleHeader";

interface Props {
  onNavigate: (tab: any) => void;
}

export const TenantManagement: React.FC<Props> = ({ onNavigate }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const login = useAuthStore((state) => state.login); // Hook added
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);

  // New State for Metrics Modal
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [selectedCompanyMetrics, setSelectedCompanyMetrics] =
    useState<Company | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // New Company Form State
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newCompanyPlanId, setNewCompanyPlanId] = useState("free");
  const [newCompanyLogoUrl, setNewCompanyLogoUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [companyData, planData] = await Promise.all([
        adminService.getAllCompanies(),
        adminService.getAllPlans(),
      ]);
      // Filter out the Master Company (which has no plan) to show only Tenants
      const tenantsOnly = companyData.filter((c) => c.planId !== null);
      setCompanies(tenantsOnly);
      setFilteredCompanies(tenantsOnly);
      setAvailablePlans(planData);
    } catch (error) {
      console.error("Failed to fetch data", error);
      toast.error("Error cargando empresas. Verifique la conexión.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filtered = companies.filter(
      (company) =>
        company.name.toLowerCase().includes(lowercasedFilter) ||
        company.slug?.toLowerCase().includes(lowercasedFilter),
    );
    setFilteredCompanies(filtered);
  }, [searchTerm, companies]);

  const handleStatusChange = async (id: string, status: CompanyStatus) => {
    setCompanies((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status,
              isActive: status === "ACTIVE" || status === "TRIAL",
            }
          : c,
      ),
    );
    await adminService.updateCompanyStatus(id, status);
  };

  const handleUpdateCompany = async (
    companyId: string,
    data: Partial<Company>,
  ) => {
    try {
      const updated = await adminService.updateCompany(companyId, data);
      setCompanies(companies.map((c) => (c.id === companyId ? updated : c)));
      setFilteredCompanies(
        filteredCompanies.map((c) => (c.id === companyId ? updated : c)),
      );
      setEditingCompany(null);
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error("Error al actualizar la empresa.");
    }
  };

  const handleImpersonate = async (id: string) => {
    const confirmed = window.confirm(
      "⚠️ SEGURIDAD: Estás a punto de entrar en la cuenta del cliente. Todas tus acciones quedarán registradas. ¿Continuar?",
    );
    if (confirmed) {
      try {
        const result = await adminService.generateImpersonationToken(id);

        // Construct minimal user object for immediate context switch
        const userToLogin = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          companyId: id,
          name: "Modo Impersonación",
          avatar: "",
          companyStatus: "ACTIVE",
        };

        // Security: Save original Master Token to allow "Exit Impersonation"
        const currentToken = useAuthStore.getState().token;
        if (currentToken) {
          localStorage.setItem("reply_master_token", currentToken);
        }

        // Login and force redirect
        login(userToLogin as any, result.token);

        // Use href to force full reload and clear any Master Admin state/sockets
        window.location.href = "/dashboard";
      } catch (error) {
        console.error("Impersonation failed", error);
        toast.error("Error al iniciar impersonación");
      }
    }
  };

  const handleViewMetrics = async (id: string) => {
    const company = companies.find((c) => c.id === id);
    if (company) {
      setSelectedCompanyMetrics(company);
      setIsMetricsModalOpen(true);
      setLoadingMetrics(true);
      try {
        const data = await adminService.getCompanyMetrics(id);
        setMetrics(data);
      } catch (error) {
        console.error("Error fetching metrics", error);
        setMetrics(null);
      } finally {
        setLoadingMetrics(false);
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const resetModal = () => {
    setNewCompanyName("");
    setNewCompanySlug("");
    setNewAdminEmail("");
    setNewAdminPassword("");
    setNewCompanyPlanId("free");
    setNewCompanyLogoUrl("");
  };

  const handleCreateCompany = async () => {
    if (
      !newCompanyName ||
      !newCompanySlug ||
      !newAdminEmail ||
      !newAdminPassword
    ) {
      toast.error("Todos los campos excepto el logo son requeridos.");
      return;
    }
    setIsCreating(true);
    try {
      // Using the public onboarding endpoint as defined in the OpenAPI spec
      const response = await fetch(`${API_BASE_URL}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: newCompanyName,
          slug: newCompanySlug,
          adminEmail: newAdminEmail,
          adminPassword: newAdminPassword,
          plan: newCompanyPlanId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Error en la solicitud: " + response.statusText,
        );
      }
      fetchData(); // Refresh list
      setIsModalOpen(false);
      resetModal();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Error al crear la empresa.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-y-auto">
      <ModuleHeader
        title="Gestión de Empresas (Tenants)"
        description="Supervisa y administra todas las cuentas de clientes en la plataforma."
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        }
        gradient="from-indigo-600 to-blue-600 dark:from-indigo-800 dark:to-blue-800"
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/20 transition-all flex items-center gap-2"
          >
            + Nueva Empresa
          </button>
        }
      />
      <div className="p-8 space-y-6">
        <div className="flex justify-between items-center bg-white dark:bg-reply-panel-dark p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm">
          <input
            type="text"
            placeholder="Buscar por nombre o slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white w-1/3"
          />
          <button
            onClick={() => onNavigate("plans")}
            className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Configurar Planes
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Cargando Inquilinos...
          </div>
        ) : (
          <AdminTenantTable
            companies={filteredCompanies}
            plans={availablePlans}
            onStatusChange={handleStatusChange}
            onImpersonate={handleImpersonate}
            onViewMetrics={handleViewMetrics}
            onEdit={(company) => setEditingCompany(company)}
          />
        )}
      </div>

      {/* Create Company Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-reply-border-dark">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark">
              <h3 className="font-bold text-lg text-gray-800 dark:text-white">
                Crear Nueva Empresa
              </h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => {
                    setNewCompanyName(e.target.value);
                    setNewCompanySlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^a-z0-9-]/g, ""),
                    );
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug (URL única)
                </label>
                <input
                  type="text"
                  value={newCompanySlug}
                  onChange={(e) =>
                    setNewCompanySlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white font-mono"
                  placeholder="ej: acme-corp"
                />
              </div>
              <div className="pt-2 border-t border-gray-200 dark:border-reply-border-dark">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Correo del Administrador
                </label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                  placeholder="admin@acme-corp.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contraseña Inicial
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Asignar Plan
                </label>
                <select
                  value={newCompanyPlanId}
                  onChange={(e) => setNewCompanyPlanId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                >
                  {availablePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} (${plan.price}/mes)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Logo (Opcional)
                </label>
                <div className="flex items-center gap-4">
                  <img
                    src={
                      newCompanyLogoUrl ||
                      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48cmVjdCB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIGZpbGw9IiNjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzMzMyI+TE9HTzwvdGV4dD48L3N2Zz4="
                    }
                    alt="Logo preview"
                    className="w-12 h-12 rounded-full object-cover bg-gray-200"
                  />
                  <button
                    onClick={() =>
                      setNewCompanyLogoUrl(
                        `https://ui-avatars.com/api/?name=${newCompanyName.replace(/\s+/g, "+")}&background=random`,
                      )
                    }
                    className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Generar Logo Aleatorio
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 bg-reply-bg dark:bg-reply-border-dark flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetModal();
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCompany}
                disabled={isCreating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50"
              >
                {isCreating ? "Creando..." : "Confirmar y Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCompany && (
        <EditCompanyModal
          company={editingCompany}
          plans={availablePlans}
          onClose={() => setEditingCompany(null)}
          onUpdate={handleUpdateCompany}
        />
      )}

      {/* Metrics Modal - Professional Dashboard */}
      {isMetricsModalOpen && selectedCompanyMetrics && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setIsMetricsModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-reply-border-dark"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center bg-white dark:bg-reply-panel-dark z-10">
              <div>
                <h3 className="font-bold text-xl text-gray-800 dark:text-white">
                  {selectedCompanyMetrics.name}
                </h3>
                <p className="text-sm text-gray-500">
                  Dashboard de Métricas Completo
                </p>
              </div>
              <button
                onClick={() => setIsMetricsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {loadingMetrics ? (
              <div className="p-12 text-center text-gray-500">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                Cargando métricas completas...
              </div>
            ) : metrics ? (
              <div className="p-6 space-y-6">
                {/* Business Metrics */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-5 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">💰</span>
                    <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                      Métricas de Negocio
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">MRR</div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        ${metrics.business?.mrr || 0}
                      </div>
                      <div className="text-xs text-gray-400">
                        Ingreso Mensual
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Plan</div>
                      <div className="text-lg font-bold text-gray-800 dark:text-white">
                        {metrics.business?.plan?.name || "N/A"}
                      </div>
                      <div className="text-xs text-gray-400">
                        ${metrics.business?.plan?.price || 0}/mes
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">Estado</div>
                      <div
                        className={`text-sm font-bold ${
                          metrics.business?.status === "ACTIVE"
                            ? "text-green-600"
                            : metrics.business?.status === "TRIAL"
                              ? "text-blue-600"
                              : "text-red-600"
                        }`}
                      >
                        {metrics.business?.status || "N/A"}
                      </div>
                      <div className="text-xs text-gray-400">
                        {metrics.business?.isActive ? "Activo" : "Inactivo"}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-500 mb-1">
                        Renovación
                      </div>
                      <div className="text-xl font-bold text-gray-800 dark:text-white">
                        {metrics.business?.daysUntilRenewal !== null
                          ? `${metrics.business.daysUntilRenewal}d`
                          : "N/A"}
                      </div>
                      <div className="text-xs text-gray-400">
                        Días restantes
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Metrics */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">📊</span>
                    <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                      Uso del Sistema
                    </h4>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Usuarios / Agentes
                        </span>
                        <span className="text-sm font-bold">
                          {metrics.usage?.users?.current || 0} /{" "}
                          {metrics.usage?.users?.limit || 0}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(metrics.usage?.users?.percentage || 0, 100)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {metrics.usage?.users?.percentage || 0}% utilizado
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          WhatsApp Activo
                        </span>
                        <span className="text-sm font-bold">
                          {metrics.usage?.whatsapp?.current || 0} /{" "}
                          {metrics.usage?.whatsapp?.limit || 0}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(metrics.usage?.whatsapp?.percentage || 0, 100)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {metrics.usage?.whatsapp?.percentage || 0}% utilizado
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Colas de Atención
                        </span>
                        <span className="text-sm font-bold">
                          {metrics.usage?.queues?.current || 0} /{" "}
                          {metrics.usage?.queues?.limit || 0}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(metrics.usage?.queues?.percentage || 0, 100)}%`,
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {metrics.usage?.queues?.percentage || 0}% utilizado
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">
                          Tickets Este Mes
                        </div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">
                          {metrics.usage?.tickets?.thisMonth || 0}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            (metrics.usage?.tickets?.growth || 0) > 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {(metrics.usage?.tickets?.growth || 0) > 0
                            ? "↑"
                            : "↓"}{" "}
                          {Math.abs(metrics.usage?.tickets?.growth || 0)}% vs
                          mes anterior
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">
                          Asistentes IA
                        </div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">
                          {metrics.usage?.aiAssistants?.current || 0}
                        </div>
                        <div className="text-xs text-gray-400">
                          de {metrics.usage?.aiAssistants?.limit || 0}{" "}
                          permitidos
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Engagement & AI Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Engagement */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-5 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">🎯</span>
                      <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                        Engagement
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Último Login Admin
                        </div>
                        <div className="text-sm font-medium text-gray-800 dark:text-white">
                          {metrics.engagement?.lastAdminLogin
                            ? new Date(
                                metrics.engagement.lastAdminLogin,
                              ).toLocaleString("es-CO")
                            : "Nunca"}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Conversaciones
                        </div>
                        <div className="text-2xl font-bold text-purple-600">
                          {metrics.engagement?.conversationsThisMonth || 0}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Mensajes Totales
                        </div>
                        <div className="text-2xl font-bold text-pink-600">
                          {metrics.engagement?.messagesThisMonth || 0}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Promedio Msgs/Conv
                        </div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">
                          {metrics.engagement?.avgMessagesPerConversation || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Performance */}
                  <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-5 rounded-xl border border-cyan-200 dark:border-cyan-800">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">🤖</span>
                      <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                        IA & Automatización
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 mb-2">
                          Tasa de Resolución IA
                        </div>
                        <div className="text-3xl font-bold text-cyan-600">
                          {metrics.ai?.resolutionRate || 0}%
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          de tickets resueltos
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Tickets Resueltos por IA
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {metrics.ai?.ticketsResolved || 0}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">
                          Tiempo Promedio Resolución
                        </div>
                        <div className="text-2xl font-bold text-gray-800 dark:text-white">
                          {formatTime(
                            metrics.ai?.avgResolutionTimeSeconds || 0,
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Health Score */}
                <div
                  className={`bg-gradient-to-r p-5 rounded-xl border ${
                    (metrics.health?.healthScore || 0) >= 80
                      ? "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800"
                      : (metrics.health?.healthScore || 0) >= 50
                        ? "from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800"
                        : "from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-red-200 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">💪</span>
                      <h4 className="font-bold text-lg text-gray-800 dark:text-white">
                        Salud de la Cuenta
                      </h4>
                    </div>
                    <div
                      className={`text-4xl font-bold ${
                        (metrics.health?.healthScore || 0) >= 80
                          ? "text-green-600"
                          : (metrics.health?.healthScore || 0) >= 50
                            ? "text-yellow-600"
                            : "text-red-600"
                      }`}
                    >
                      {metrics.health?.healthScore || 0}
                      <span className="text-lg">/100</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {metrics.health?.openTickets || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Tickets Abiertos
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {metrics.health?.overdueTickets || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Tickets Vencidos
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center">
                      <div
                        className={`text-sm font-bold ${
                          (metrics.health?.healthScore || 0) >= 80
                            ? "text-green-600"
                            : (metrics.health?.healthScore || 0) >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {(metrics.health?.healthScore || 0) >= 80
                          ? "Excelente"
                          : (metrics.health?.healthScore || 0) >= 50
                            ? "Regular"
                            : "Crítico"}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Estado General
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-red-500">
                Error al cargar métricas
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EditCompanyModal: React.FC<{
  company: Company;
  plans: Plan[];
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Company>) => Promise<void>;
}> = ({ company, plans, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({
    name: company.name,
    slug: company.slug || "",
    planId: company.planId || "",
    status: company.status,
    subscriptionEndsAt: company.subscriptionEndsAt
      ? new Date(company.subscriptionEndsAt).toISOString().split("T")[0]
      : "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Optimistic UI update could be done here if needed, but loading state is safer
      await onUpdate(company.id, {
        ...(formData as any),
        subscriptionEndsAt: formData.subscriptionEndsAt
          ? new Date(formData.subscriptionEndsAt)
          : null,
        // Ensure planId matches backend expectations (string or null)
        planId: formData.planId || null,
      });
      // Modal closes via parent state update in onUpdate, but we can double check
    } catch (error) {
      console.error("Failed to update", error);
      setIsSaving(false); // Only stop loading on error, success unmounts component
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 dark:border-reply-border-dark flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-5 border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-surface-dark flex justify-between items-center">
          <div>
            <h3 className="font-bold text-xl text-gray-800 dark:text-white flex items-center gap-2">
              <span className="text-2xl">🏢</span> Editar Empresa
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Modificando configuración para{" "}
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {company.name}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="p-8 overflow-y-auto custom-scrollbar"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1 */}
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                  Nombre de la Empresa
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Ej: Acme Corp"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                  Plan de Suscripción
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </span>
                  <select
                    value={formData.planId}
                    onChange={(e) =>
                      setFormData({ ...formData, planId: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                  >
                    <option value="">-- Sin Plan (Gratuito) --</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — ${p.price}/mes
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-4 top-3.5 text-gray-400 pointer-events-none">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                  Fin de Suscripción
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </span>
                  <input
                    type="date"
                    value={formData.subscriptionEndsAt}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        subscriptionEndsAt: e.target.value,
                      })
                    }
                    className="w-full pl-10 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                  Slug (URL)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400 font-mono text-sm">
                    /
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value })
                    }
                    className="w-full pl-8 pr-4 py-3 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-white font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="mi-empresa"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 ml-1">
                  Identificador único para la URL del tenant.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 tracking-wider">
                  Estado de la Cuenta
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {["ACTIVE", "TRIAL", "OVERDUE", "BANNED"].map((status) => (
                    <label
                      key={status}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        formData.status === status
                          ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500"
                          : "bg-white dark:bg-reply-panel-dark border-gray-200 dark:border-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={status}
                        checked={formData.status === status}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            status: e.target.value as any,
                          })
                        }
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      />
                      <div className="flex-1">
                        <span
                          className={`font-bold text-sm ${
                            status === "ACTIVE"
                              ? "text-green-600"
                              : status === "TRIAL"
                                ? "text-blue-600"
                                : status === "OVERDUE"
                                  ? "text-orange-600"
                                  : "text-red-600"
                          }`}
                        >
                          {status === "ACTIVE"
                            ? "Activo"
                            : status === "TRIAL"
                              ? "En Prueba (Trial)"
                              : status === "OVERDUE"
                                ? "Pago Vencido"
                                : "Suspendido / Banneado"}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100 dark:border-reply-border-dark">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-xl text-sm font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
