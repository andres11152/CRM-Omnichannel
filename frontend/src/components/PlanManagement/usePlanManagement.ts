import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plan } from "@/types";
import { adminService } from "@/services/adminService";
import { useModal } from "@/context/ModalContext";
import { FEATURE_META } from "./featureMeta";

export const usePlanManagement = () => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const fetchedPlans = await adminService.getAllPlans();
      // Sort plans by price
      const sortedPlans = fetchedPlans.sort((a, b) => a.price - b.price);
      setPlans(sortedPlans);

      if (sortedPlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(sortedPlans[0].id);
      } else if (selectedPlanId && !sortedPlans.find((p) => p.id === selectedPlanId)) {
        // If selected plan was deleted, select the first one
        setSelectedPlanId(sortedPlans[0]?.id || null);
      }
    } catch (error) {
      console.error("Failed to fetch plans", error);
      toast.error(t("plans_mgmt.toast.load_error", "Error al cargar planes"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync form data when selection changes
  useEffect(() => {
    if (selectedPlanId) {
      const plan = plans.find((p) => p.id === selectedPlanId);
      if (plan) {
        setFormData(JSON.parse(JSON.stringify(plan))); // Deep copy to avoid direct mutation
      }
    } else {
      setFormData(null);
    }
  }, [selectedPlanId, plans]);

  const handleInputChange = (field: keyof Plan, value: string) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
  };

  const handlePriceChange = (value: string) => {
    if (!formData) return;
    const price = parseFloat(value);
    setFormData({ ...formData, price: isNaN(price) ? 0 : price });
  };

  const handleConfigChange = (key: string, value: string | number | boolean) => {
    if (!formData) return;
    setFormData({
      ...formData,
      config: { ...formData.config, [key]: value },
    });
  };

  const addFeature = (key: string) => {
    if (!formData || formData.config[key] !== undefined) return;
    const meta = FEATURE_META[key];
    const defaultValue = meta?.type === "number" ? 0 : false;

    setFormData({
      ...formData,
      config: { ...formData.config, [key]: defaultValue },
    });
  };

  const removeFeature = (key: string) => {
    if (!formData) return;
    const newConfig = { ...formData.config };
    delete (newConfig as Record<string, unknown>)[key];
    setFormData({ ...formData, config: newConfig });
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    try {
      const savedPlan = await adminService.savePlan(formData);

      // Update local list
      setPlans((prev) => {
        const exists = prev.find((p) => p.id === savedPlan.id);
        if (exists) {
          return prev.map((p) => (p.id === savedPlan.id ? savedPlan : p));
        } else {
          return [...prev, savedPlan];
        }
      });

      toast.success(t("plans_mgmt.toast.saved", "Plan guardado"));
    } catch (error) {
      console.error("Error saving plan", error);
      toast.error(t("plans_mgmt.toast.save_error", "Error al guardar plan"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePlan = () => {
    // Generate a temporary ID. In a real app, backend might generate this,
    // but since we use upsert with ID, we need to provide one.
    const newId = crypto.randomUUID ? crypto.randomUUID() : `plan_${Date.now()}`;

    const newPlan: Plan = {
      id: newId,
      name: "Nuevo Plan",
      price: 0,
      currency: "USD",
      stripePriceId: "",
      isActive: true,
      config: {
        max_users: 1,
        max_queues: 1,
        max_whatsapp_connections: 1,
        can_use_ai: false,
        can_remove_branding: false,
        can_use_api: false,
      },
    };

    setPlans((prev) => [...prev, newPlan]);
    setSelectedPlanId(newPlan.id);
  };

  const handleDeletePlan = async () => {
    if (!selectedPlanId || !formData) return;

    const ok = await confirm({
      title: `¿Eliminar plan "${formData.name}"?`,
      message: "Esta acción es permanente y no se puede deshacer.",
      confirmText: "Eliminar plan",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) {
      setIsDeleting(true);
      try {
        await adminService.deletePlan(selectedPlanId);

        const newPlans = plans.filter((p) => p.id !== selectedPlanId);
        setPlans(newPlans);
        setSelectedPlanId(newPlans[0]?.id || null);

        toast.success(t("plans_mgmt.toast.deleted", "Plan eliminado"));
      } catch (error) {
        console.error("Error deleting plan", error);
        toast.error(t("plans_mgmt.toast.delete_error", "Error al eliminar plan"));
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return {
    plans,
    selectedPlanId,
    setSelectedPlanId,
    formData,
    isLoading,
    isSaving,
    isDeleting,
    handleInputChange,
    handlePriceChange,
    handleConfigChange,
    addFeature,
    removeFeature,
    handleSave,
    handleCreatePlan,
    handleDeletePlan,
  };
};
