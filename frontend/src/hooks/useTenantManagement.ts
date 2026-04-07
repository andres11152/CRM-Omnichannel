import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { Company, CompanyStatus, Plan } from "@/types";
import { adminService, CompanyMetrics } from "@/services/adminService";
import { Logger } from "@/utils/logger";

export function useTenantManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const login = useAuthStore((state) => state.login);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Metrics state
  const [selectedCompanyMetrics, setSelectedCompanyMetrics] = useState<Company | null>(null);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // New Company Form State
  const [isCreating, setIsCreating] = useState(false);

  const fetchData = useCallback(async () => {
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
      Logger.error("[useTenantManagement] Failed to fetch data", error);
      toast.error("Error cargando empresas. Verifique la conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filtered = companies.filter(
      (company) =>
        company.name.toLowerCase().includes(lowercasedFilter) ||
        (company as any).slug?.toLowerCase().includes(lowercasedFilter),
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
    try {
      await adminService.updateCompanyStatus(id, status);
      toast.success("Estado actualizado.");
    } catch (error) {
      Logger.error("[useTenantManagement] Error al actualizar estado", error);
      toast.error("Error al actualizar estado.");
      fetchData(); // Rollback
    }
  };

  const handleUpdateCompany = async (companyId: string, data: Partial<Company>) => {
    try {
      const updated = await adminService.updateCompany(companyId, data);
      setCompanies(companies.map((c) => (c.id === companyId ? updated : c)));
      setEditingCompany(null);
      toast.success("Empresa actualizada correctamente.");
    } catch (error) {
      Logger.error("[useTenantManagement] Error updating company", error);
      toast.error("Error al actualizar la empresa.");
    }
  };

  const handleImpersonate = async (id: string) => {
    const confirmed = window.confirm(
      "[WARNING] SEGURIDAD: Estás a punto de entrar en la cuenta del cliente. Todas tus acciones quedarán registradas. ¿Continuar?",
    );
    if (!confirmed) return;

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
      Logger.error("[useTenantManagement] Impersonation failed", error);
      toast.error("Error al iniciar impersonación");
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
        Logger.error("[useTenantManagement] Error fetching metrics", error);
        setMetrics(null);
      } finally {
        setLoadingMetrics(false);
      }
    }
  };

  return {
    companies,
    filteredCompanies,
    loading,
    searchTerm,
    setSearchTerm,
    availablePlans,
    isModalOpen,
    setIsModalOpen,
    isMetricsModalOpen,
    setIsMetricsModalOpen,
    editingCompany,
    setEditingCompany,
    selectedCompanyMetrics,
    metrics,
    loadingMetrics,
    isCreating,
    setIsCreating,
    handleStatusChange,
    handleUpdateCompany,
    handleImpersonate,
    handleViewMetrics,
    refresh: fetchData,
  };
}
