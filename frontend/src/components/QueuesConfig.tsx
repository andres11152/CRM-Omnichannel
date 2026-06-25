import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { QueueConfig, Agent } from "@/types";
import { Modal, ModalButton } from "@/components/ui/Modal";
import {
  getQueues,
  createQueue,
  updateQueue,
  deleteQueue,
  CreateQueueDTO,
} from "@/services/queueService";
import {
  getDepartments,
  createDepartment,
  Department,
} from "@/services/departmentService";
import { getAssistants } from "@/services/aiService";

const QueuesConfig: React.FC = () => {
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assistants, setAssistants] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<QueueConfig | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreateQueueDTO>({
    name: "",
    departmentId: "",
    type: "MANUAL",
    aiAssistantId: "",
    promptTemplateId: "Default",
    config: { requiredSkills: [] },
  });
  const [isSaving, setIsSaving] = useState(false);

  // Inline Department Creation
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [queuesData, deptsData, assistantsData] = await Promise.all([
        getQueues(),
        getDepartments(),
        getAssistants(),
      ]);
      setQueues(queuesData);
      setDepartments(deptsData);
      setAssistants(assistantsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error(t("queues_config.toasts.err_load", "Error al cargar la configuración."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (queue?: QueueConfig) => {
    if (queue) {
      setEditingQueue(queue);
      setFormData({
        name: queue.name,
        departmentId: queue.departmentDetails?.id || queue.departmentId || "",
        type: queue.type || "MANUAL",
        aiAssistantId: queue.aiAssistantId || "",
        promptTemplateId: queue.promptTemplateId || "Default",
        config: (queue as unknown as { config?: { requiredSkills: string[] } })
          .config || { requiredSkills: [] },
      });
    } else {
      setEditingQueue(null);
      setFormData({
        name: "",
        departmentId: departments.length > 0 ? departments[0].id : "",
        type: "MANUAL",
        aiAssistantId: "",
        promptTemplateId: "Default",
        config: { requiredSkills: [] },
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingQueue(null);
    setIsCreatingDept(false);
    setNewDeptName("");
  };

  const handleSave = async () => {
    if (!formData.name)
      return toast.error(t("queues_config.toasts.err_name_req", "El nombre de la cola es obligatorio"));
    if (!formData.departmentId)
      return toast.error(t("queues_config.toasts.err_dept_req", "Debes seleccionar un departamento"));

    setIsSaving(true);
    try {
      if (editingQueue) {
        await updateQueue(editingQueue.id, formData);
        toast.success(t("queues_config.toasts.update_success", "Cola actualizada correctamente"));
      } else {
        await createQueue(formData);
        toast.success(t("queues_config.toasts.create_success", "Cola creada correctamente"));
      }
      loadData(); // Refresh list to ensure consistency
      handleCloseModal();
    } catch (error: unknown) {
      console.error("Error saving queue:", error);
      toast.error(
        error instanceof Error ? error.message : t("queues_config.toasts.err_save", "Error al guardar la cola"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        t("queues_config.toasts.confirm_delete", "¿Estás seguro de eliminar esta cola? Esta acción no se puede deshacer."),
      )
    )
      return;
    try {
      await deleteQueue(id);
      setQueues(queues.filter((q) => q.id !== id));
      toast.success(t("queues_config.toasts.delete_success", "Cola eliminada correctamente"));
    } catch (error: unknown) {
      console.error("Error deleting queue:", error);
      toast.error(
        error instanceof Error ? error.message : t("queues_config.toasts.err_delete", "Error al eliminar la cola"),
      );
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      const newDept = await createDepartment(newDeptName);
      setDepartments([...departments, newDept]);
      setFormData({ ...formData, departmentId: newDept.id });
      setNewDeptName("");
      setIsCreatingDept(false);
      toast.success(t("queues_config.toasts.dept_success", "Departamento creado"));
    } catch (error) {
      toast.error(t("queues_config.toasts.err_dept", "Error al crear departamento"));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark p-8 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            {t("queues_config.title", "Configuración de Colas")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {t("queues_config.description", "Administra cómo se distribuyen y atienden los tickets.")}
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-colors"
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          {t("queues_config.new_queue", "Nueva Cola")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : queues.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-gray-400 p-10">
            <svg
              className="w-16 h-16 mb-4 opacity-20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-lg font-medium">{t("queues_config.no_queues", "No hay colas configuradas")}</p>
            <p className="text-sm">
              {t("queues_config.create_first", "Crea la primera para empezar a recibir tickets.")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-reply-bg dark:bg-reply-surface-dark border-b border-gray-200 dark:border-reply-border-dark">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                    {t("queues_config.table.name", "Nombre")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                    {t("queues_config.table.department", "Departamento")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                    {t("queues_config.table.assignment", "Tipo Asignación")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                    {t("queues_config.table.ai_assistant", "Asistente IA")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase text-right">
                    {t("queues_config.table.actions", "Acciones")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {queues.map((queue) => (
                  <tr
                    key={queue.id}
                    className="hover:bg-reply-bg dark:hover:bg-[#2a3942] transition-colors group"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {queue.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      <span className="bg-gray-100 dark:bg-reply-surface-dark px-2 py-1 rounded text-xs border border-gray-200 dark:border-reply-border-dark">
                        {queue.departmentDetails?.name ||
                          (typeof queue.department === "object"
                            ? (queue.department as unknown as { name?: string })
                                ?.name
                            : queue.department) ||
                          "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {queue.type === "AI" ? (
                        <span className="text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center gap-1">
                           {t("queues_config.types.ai", "IA Automation")}
                        </span>
                      ) : queue.type === "ROUND_ROBIN" ? (
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1">
                          [SYNC] {t("queues_config.types.round_robin", "Round Robin")}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          {t("queues_config.types.manual", "Manual")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {queue.aiAssistantId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">[AI]</span>
                          <span>
                            {assistants.find(
                              (a) => a.id === queue.aiAssistantId,
                            )?.name || t("common.unknown", "Asistente Desconocido")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">
                          {t("queues_config.none", "Ninguno")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenModal(queue)}
                          className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded transition-colors"
                          title={t("queues_config.edit", "Editar")}
                        >
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
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(queue.id)}
                          className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition-colors"
                          title={t("queues_config.delete", "Eliminar")}
                        >
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingQueue ? t("queues_config.modal.edit_title", "Editar Cola") : t("queues_config.modal.create_title", "Crear Nueva Cola")}
        icon={<Users className="w-5 h-5" />}
        size="md"
        busy={isSaving}
        footer={
          <>
            <ModalButton variant="secondary" onClick={handleCloseModal}>
              {t("common.cancel", "Cancelar")}
            </ModalButton>
            <ModalButton variant="primary" onClick={handleSave} loading={isSaving}>
              {isSaving
                ? t("queues_config.modal.saving", "Guardando...")
                : editingQueue
                  ? t("queues_config.modal.update", "Actualizar")
                  : t("queues_config.modal.create", "Crear Cola")}
            </ModalButton>
          </>
        }
      >
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t("queues_config.modal.queue_name", "Nombre de la Cola")}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("queues_config.modal.name_placeholder", "Ej: Ventas VIP")}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t("queues_config.modal.department", "Departamento")}
                </label>
                {!isCreatingDept ? (
                  <div className="flex gap-2">
                    <select
                      value={formData.departmentId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          departmentId: e.target.value,
                        })
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      {departments.length === 0 && (
                        <option value="">{t("queues_config.modal.no_depts", "Sin departamentos")}</option>
                      )}
                    </select>
                    <button
                      onClick={() => setIsCreatingDept(true)}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium border border-gray-300 dark:border-reply-border-dark"
                      title="Nuevo Departamento"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      placeholder="Nuevo Dept..."
                      className="flex-1 px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateDepartment}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      
                    </button>
                    <button
                      onClick={() => setIsCreatingDept(false)}
                      className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Assignment Type */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t("queues_config.modal.assignment", "Asignación")}
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as typeof formData.type,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="MANUAL">{t("queues_config.types.manual", "Manual")}</option>
                    <option value="ROUND_ROBIN">{t("queues_config.modal.assignment_auto", "Automática (Round Robin)")}</option>
                  </select>
                </div>

                {/* AI Assistant */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t("queues_config.table.ai_assistant", "Asistente IA")}
                  </label>
                  <select
                    value={formData.aiAssistantId || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        aiAssistantId: e.target.value || null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">{t("queues_config.none", "Ninguno")}</option>
                    {assistants.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SKILLS - 100 Year Feature */}
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t("queues_config.modal.required_skills", "Skills Requeridos (Opcional)")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={formData.config?.requiredSkills?.join(", ") || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Don't filter immediately to allow typing spaces
                      const skills = val.split(",").map((s) => s.trim());
                      // Filter empty only on save effectively, but here we store as array
                      // Better: Store raw input if possible? No, bound to array.
                      // We'll clean on save? Or just filter empty strings rendering default.
                      const cleanSkills = skills.filter((s) => s !== "");
                      setFormData({
                        ...formData,
                        config: {
                          ...formData.config,
                          requiredSkills: val.split(",").map((s) => s.trim()),
                        }, // Keep empties to allow typing commasp
                      });
                    }}
                    onBlur={() => {
                      // Clean on blur
                      const current = formData.config?.requiredSkills || [];
                      const clean = current.filter(Boolean);
                      setFormData({
                        ...formData,
                        config: { ...formData.config, requiredSkills: clean },
                      });
                    }}
                    placeholder={t("queues_config.modal.skills_placeholder", "Ej: Ventas, Inglés, VIP (Separados por coma)")}
                    className="w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">
                  {t("queues_config.modal.skills_hint", "El sistema solo asignará chats a agentes que tengan TODOS estos skills.")}
                </p>
              </div>
            </div>
      </Modal>
    </div>
  );
};

export default QueuesConfig;
