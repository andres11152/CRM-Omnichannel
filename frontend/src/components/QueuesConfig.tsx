import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Users, Trash2, Pencil, Plus, Bot, RotateCw, Hand, AlertTriangle } from "lucide-react";
import { QueueConfig } from "@/types";
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

const EMPTY_FORM: CreateQueueDTO = {
  name: "",
  departmentId: null,
  type: "MANUAL",
  aiAssistantId: null,
  config: { requiredSkills: [] },
};

const QueuesConfig: React.FC = () => {
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assistants, setAssistants] = useState<Array<{ id: string; name: string }>>([]);
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<QueueConfig | null>(null);
  const [formData, setFormData] = useState<CreateQueueDTO>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  // Inline delete confirmation — no confirm() dialog
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
    } catch {
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
        departmentId: (queue as unknown as { departmentDetails?: { id: string } }).departmentDetails?.id
          || (queue as unknown as { departmentId?: string | null }).departmentId
          || null,
        type: queue.type || "MANUAL",
        aiAssistantId: queue.aiAssistantId || null,
        config: (queue as unknown as { config?: { requiredSkills: string[] } }).config
          || { requiredSkills: [] },
      });
    } else {
      setEditingQueue(null);
      setFormData({
        ...EMPTY_FORM,
        departmentId: departments.length > 0 ? departments[0].id : null,
      });
    }
    setIsCreatingDept(false);
    setNewDeptName("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingQueue(null);
    setIsCreatingDept(false);
    setNewDeptName("");
  };

  const patch = (fields: Partial<CreateQueueDTO>) =>
    setFormData((prev) => ({ ...prev, ...fields }));

  const handleSave = async () => {
    if (!formData.name.trim())
      return toast.error(t("queues_config.toasts.err_name_req", "El nombre de la cola es obligatorio"));

    setIsSaving(true);
    try {
      // Sanitize: send null for empty strings to satisfy backend CUID validation
      const payload: CreateQueueDTO = {
        ...formData,
        name: formData.name.trim(),
        departmentId: formData.departmentId || null,
        aiAssistantId: formData.aiAssistantId || null,
        config: {
          requiredSkills: (formData.config?.requiredSkills || []).filter(Boolean),
        },
      };

      if (editingQueue) {
        await updateQueue(editingQueue.id, payload);
        toast.success(t("queues_config.toasts.update_success", "Cola actualizada correctamente"));
      } else {
        await createQueue(payload);
        toast.success(t("queues_config.toasts.create_success", "Cola creada correctamente"));
      }
      loadData();
      handleCloseModal();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("queues_config.toasts.err_save", "Error al guardar la cola"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteQueue(id);
      setQueues((prev) => prev.filter((q) => q.id !== id));
      setPendingDeleteId(null);
      toast.success(t("queues_config.toasts.delete_success", "Cola eliminada correctamente"));
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("queues_config.toasts.err_delete", "Error al eliminar la cola"),
      );
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      const newDept = await createDepartment(newDeptName);
      setDepartments((prev) => [...prev, newDept]);
      patch({ departmentId: newDept.id });
      setNewDeptName("");
      setIsCreatingDept(false);
      toast.success(t("queues_config.toasts.dept_success", "Departamento creado"));
    } catch {
      toast.error(t("queues_config.toasts.err_dept", "Error al crear departamento"));
    }
  };

  const typeBadge = (type: string) => {
    if (type === "AI")
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800/40">
          <Bot className="w-3 h-3" /> IA
        </span>
      );
    if (type === "ROUND_ROBIN")
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/40">
          <RotateCw className="w-3 h-3" /> Round Robin
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
        <Hand className="w-3 h-3" /> Manual
      </span>
    );
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
          <Plus className="w-4 h-4" />
          {t("queues_config.new_queue", "Nueva Cola")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl border border-gray-200 dark:border-reply-border-dark shadow-sm overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : queues.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-gray-400 p-10 gap-3">
            <Users className="w-16 h-16 opacity-20" />
            <p className="text-lg font-medium">{t("queues_config.no_queues", "No hay colas configuradas")}</p>
            <p className="text-sm">{t("queues_config.create_first", "Crea la primera para empezar a recibir tickets.")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-reply-bg dark:bg-reply-surface-dark border-b border-gray-200 dark:border-reply-border-dark">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("queues_config.table.name", "Nombre")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("queues_config.table.department", "Departamento")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("queues_config.table.assignment", "Tipo")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("queues_config.table.ai_assistant", "Asistente IA")}
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
                    {t("queues_config.table.actions", "Acciones")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {queues.map((queue) => {
                  const isPendingDelete = pendingDeleteId === queue.id;
                  const deptName =
                    (queue as unknown as { departmentDetails?: { name: string } }).departmentDetails?.name
                    || (typeof queue.department === "object"
                      ? (queue.department as unknown as { name?: string })?.name
                      : queue.department)
                    || null;

                  return (
                    <tr
                      key={queue.id}
                      className="hover:bg-reply-bg dark:hover:bg-[#2a3942] transition-colors group"
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                        {queue.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {deptName ? (
                          <span className="bg-gray-100 dark:bg-reply-surface-dark px-2 py-1 rounded text-xs border border-gray-200 dark:border-reply-border-dark">
                            {deptName}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600 text-xs italic">
                            {t("queues_config.none", "General")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {typeBadge(queue.type || "MANUAL")}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {queue.aiAssistantId ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300">
                            <Bot className="w-3.5 h-3.5" />
                            {assistants.find((a) => a.id === queue.aiAssistantId)?.name
                              || t("common.unknown", "Asistente")}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">{t("queues_config.none", "Ninguno")}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isPendingDelete ? (
                          /* Inline confirmation — no native confirm() */
                          <div className="flex justify-end items-center gap-2">
                            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t("queues_config.confirm_delete_q", "¿Eliminar?")}
                            </span>
                            <button
                              onClick={() => handleDelete(queue.id)}
                              className="text-xs font-bold px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                            >
                              {t("common.yes", "Sí")}
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(null)}
                              className="text-xs font-medium px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                              {t("common.cancel", "No")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenModal(queue)}
                              className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded transition-colors"
                              title={t("queues_config.edit", "Editar")}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(queue.id)}
                              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition-colors"
                              title={t("queues_config.delete", "Eliminar")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingQueue
          ? t("queues_config.modal.edit_title", "Editar Cola")
          : t("queues_config.modal.create_title", "Crear Nueva Cola")}
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
              onChange={(e) => patch({ name: e.target.value })}
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
                  value={formData.departmentId || ""}
                  onChange={(e) => patch({ departmentId: e.target.value || null })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">{t("queues_config.modal.no_dept_option", "Sin departamento (General)")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setIsCreatingDept(true)}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium border border-gray-300 dark:border-reply-border-dark"
                  title={t("queues_config.modal.new_dept", "Nuevo Departamento")}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateDepartment()}
                  placeholder={t("queues_config.modal.dept_placeholder", "Nombre del departamento...")}
                  className="flex-1 px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                />
                <button
                  onClick={handleCreateDepartment}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  {t("common.save", "Crear")}
                </button>
                <button
                  onClick={() => { setIsCreatingDept(false); setNewDeptName(""); }}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {t("common.cancel", "✕")}
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
                onChange={(e) => patch({ type: e.target.value as CreateQueueDTO["type"] })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="MANUAL">{t("queues_config.types.manual", "Manual")}</option>
                <option value="ROUND_ROBIN">{t("queues_config.modal.assignment_auto", "Automática (Round Robin)")}</option>
                <option value="AI">{t("queues_config.types.ai", "IA Automation")}</option>
              </select>
            </div>

            {/* AI Assistant */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                {t("queues_config.table.ai_assistant", "Asistente IA")}
              </label>
              <select
                value={formData.aiAssistantId || ""}
                onChange={(e) => {
                  const val = e.target.value || null;
                  patch({
                    aiAssistantId: val,
                    // Auto-set type to AI when an assistant is selected
                    type: val ? "AI" : (formData.type === "AI" ? "MANUAL" : formData.type),
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">{t("queues_config.none", "Ninguno")}</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
              {t("queues_config.modal.required_skills", "Skills Requeridos (Opcional)")}
            </label>
            <input
              type="text"
              value={formData.config?.requiredSkills?.join(", ") || ""}
              onChange={(e) => {
                patch({
                  config: {
                    ...formData.config,
                    requiredSkills: e.target.value.split(",").map((s) => s.trim()),
                  },
                });
              }}
              onBlur={() => {
                patch({
                  config: {
                    ...formData.config,
                    requiredSkills: (formData.config?.requiredSkills || []).filter(Boolean),
                  },
                });
              }}
              placeholder={t("queues_config.modal.skills_placeholder", "Ej: Ventas, Inglés, VIP (Separados por coma)")}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t("queues_config.modal.skills_hint", "El sistema solo asignará chats a agentes que tengan TODOS estos skills.")}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default QueuesConfig;
