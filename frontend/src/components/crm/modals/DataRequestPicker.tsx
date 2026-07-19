import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { 
  Mail, 
  Phone, 
  MapPin, 
  IdCard, 
  FileCheck, 
  Fingerprint, 
  Tag,
  UserSquare2, 
  Loader2, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  Pencil, 
  AlertCircle, 
  Send, 
  Save 
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { companyService, SuggestedField, CompanySettings } from "@/services/companyService";

const DEFAULT_FIELDS = [
  { id: "email", label: "Correo Electrónico", icon: Mail, color: "bg-blue-500" },
  { id: "phone", label: "Número de Teléfono", icon: Phone, color: "bg-emerald-500" },
  { id: "location", label: "Ubicación GPS", icon: MapPin, color: "bg-rose-500" },
  { id: "id_doc", label: "Documento Identidad", icon: IdCard, color: "bg-indigo-500" },
  { id: "fiscal", label: "Datos Fiscales / RUT", icon: FileCheck, color: "bg-amber-500" },
  { id: "kyc", label: "Validación KYC", icon: Fingerprint, color: "bg-purple-500" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Mail, Phone, MapPin, IdCard, FileCheck, Fingerprint, Tag
};

export interface DataRequestPickerProps {
  onClose: () => void;
  onConfirm: (fields: string[]) => void;
}

export const DataRequestPicker: React.FC<DataRequestPickerProps> = ({ onClose, onConfirm }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [suggestedFields, setSuggestedFields] = useState<SuggestedField[]>(DEFAULT_FIELDS.map(f => ({ ...f, iconName: f.id })));
  const [newCustomField, setNewCustomField] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  const { t } = useTranslation();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings: CompanySettings = await companyService.getSettings();
      if (settings?.dataRequest?.suggestedFields && settings.dataRequest.suggestedFields.length > 0) {
        const mapped: SuggestedField[] = settings.dataRequest.suggestedFields.map((f: SuggestedField) => ({
          ...f,
          icon: f.iconName ? (ICON_MAP[f.iconName] || Tag) : Tag
        }));
        setSuggestedFields(mapped);
      }
    } catch (error) {
      console.error("Failed to load data request settings", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (label: string) => {
    setSelectedIds(prev => 
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    );
  };

  const addCustomField = () => {
    if (!newCustomField.trim()) return;
    if (!customFields.includes(newCustomField.trim())) {
      setCustomFields([...customFields, newCustomField.trim()]);
      setSelectedIds([...selectedIds, newCustomField.trim()]);
    }
    setNewCustomField("");
  };

  const saveToConfig = async (label: string) => {
    setIsSaving(true);
    try {
      const newField = { 
        id: `custom_${Date.now()}`, 
        label, 
        iconName: "Tag", 
        color: "bg-purple-500" 
      };
      
      const updatedFields = [...suggestedFields.map(f => ({
        id: f.id,
        label: f.label,
        iconName: f.iconName || "Tag",
        color: f.color
      })), newField];

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });
      
      toast.success(t("actions.field_saved", "Campo guardado"));
      setCustomFields(prev => prev.filter(f => f !== label));
      setSuggestedFields([...suggestedFields, { ...newField, icon: Tag }]);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (fieldId: string) => {
    if (!editingLabel.trim()) {
      toast.error(t("actions.err_empty_field", "El nombre del campo no puede estar vacío"));
      return;
    }

    const isDuplicate = suggestedFields.some(
      f => f.id !== fieldId && f.label.toLowerCase() === editingLabel.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast.error(t("actions.err_duplicate_field", "Ya existe un campo con este nombre"));
      return;
    }

    setIsSaving(true);
    try {
      const oldField = suggestedFields.find(f => f.id === fieldId);
      const oldLabel = oldField ? oldField.label : "";

      const updatedFields = suggestedFields.map(f => {
        if (f.id === fieldId) {
          return {
            id: f.id,
            label: editingLabel.trim(),
            iconName: f.iconName || "Tag",
            color: f.color || "bg-purple-500"
          };
        }
        return {
          id: f.id,
          label: f.label,
          iconName: f.iconName || "Tag",
          color: f.color
        };
      });

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });

      setSuggestedFields(prev => prev.map(f => {
        if (f.id === fieldId) {
          return { ...f, label: editingLabel.trim() };
        }
        return f;
      }));

      if (oldLabel && selectedIds.includes(oldLabel)) {
        setSelectedIds(prev => prev.map(lbl => lbl === oldLabel ? editingLabel.trim() : lbl));
      }

      toast.success(t("actions.field_updated", "Campo actualizado"));
      setEditingFieldId(null);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    setIsSaving(true);
    try {
      const fieldToDelete = suggestedFields.find(f => f.id === fieldId);
      const labelToDelete = fieldToDelete ? fieldToDelete.label : "";

      const updatedFields = suggestedFields
        .filter(f => f.id !== fieldId)
        .map(f => ({
          id: f.id,
          label: f.label,
          iconName: f.iconName || "Tag",
          color: f.color
        }));

      await companyService.updateSettings({
        dataRequest: { suggestedFields: updatedFields }
      });

      setSuggestedFields(prev => prev.filter(f => f.id !== fieldId));
      if (labelToDelete) {
        setSelectedIds(prev => prev.filter(lbl => lbl !== labelToDelete));
      }

      toast.success(t("actions.field_deleted", "Campo eliminado"));
      setDeletingFieldId(null);
    } catch (error) {
      toast.error(t("actions.err_save_config", "Error al guardar"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length === 0) return toast.error(t("actions.err_select_data", "Selecciona al menos un dato"));
    onConfirm(selectedIds);
  };

  const handleSelectAll = () => {
    const allLabels = [...suggestedFields.map(o => o.label), ...customFields];
    setSelectedIds(allLabels);
  };

  return (
    <Modal isOpen onClose={onClose} title={t("actions.data_title", "Solicitud Dinámica Configurable")} size="md">
      <div className="space-y-6">
        {/* Info & Select All */}
        <div className="flex items-center justify-between gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex flex-1 items-center gap-3 border border-indigo-100 dark:border-indigo-500/20">
            <UserSquare2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-[11px] text-indigo-800 dark:text-indigo-200 font-medium leading-tight">
              {t("actions.data_desc", "Configura y guarda los datos requeridos para tus procesos oficiales.")}
            </p>
          </div>
          <button 
            onClick={handleSelectAll}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest transition-all shadow-sm"
          >
            {t("actions.select_all", "Seleccionar Todo")}
          </button>
        </div>

        {/* Suggested Grid */}
        {isLoading ? (
           <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
           </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
            {suggestedFields.map((opt) => {
              const isSelected = selectedIds.includes(opt.label);
              const Icon = opt.icon || Tag;
              const isCustom = !DEFAULT_FIELDS.some(df => df.id === opt.id);

              if (editingFieldId === opt.id) {
                return (
                  <div
                    key={opt.id}
                    className="p-3 border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 rounded-2xl transition-all text-left relative overflow-hidden flex flex-col justify-between min-h-[110px]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-6 h-6 rounded-md ${opt.color || 'bg-purple-500'} flex items-center justify-center text-white shadow-sm`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Editar campo</span>
                    </div>
                    <input
                      type="text"
                      className="w-full bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-500/40 rounded-lg px-2 py-1 text-xs outline-none text-gray-800 dark:text-gray-100 font-bold focus:ring-2 focus:ring-indigo-500/20"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(opt.id);
                        if (e.key === "Escape") setEditingFieldId(null);
                      }}
                      autoFocus
                    />
                    <div className="flex gap-1.5 mt-2 justify-end">
                      <button
                        onClick={() => setEditingFieldId(null)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded text-gray-400 hover:text-gray-600 transition-colors"
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => handleSaveEdit(opt.id)}
                        disabled={isSaving}
                        className="p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center justify-center"
                        title="Guardar"
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                    </div>
                  </div>
                );
              }

              if (deletingFieldId === opt.id) {
                return (
                  <div
                    key={opt.id}
                    className="p-3 border-2 border-red-500 bg-red-50/50 dark:bg-red-500/10 rounded-2xl transition-all text-left relative overflow-hidden flex flex-col justify-between min-h-[110px] animate-in fade-in duration-200"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center text-white shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">¿Eliminar?</span>
                    </div>
                    <div className="text-[10px] text-red-600 dark:text-red-400 font-bold leading-tight mb-2">
                      Esta acción es permanente.
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => setDeletingFieldId(null)}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        No
                      </button>
                      <button
                        onClick={() => handleDeleteField(opt.id)}
                        disabled={isSaving}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded shadow-sm hover:shadow transition-colors flex items-center gap-1"
                      >
                        {isSaving && <Loader2 size={10} className="animate-spin" />}
                        Sí, borrar
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => toggleSelection(opt.label)}
                  className={`p-3 border-2 rounded-2xl transition-all text-left group relative overflow-hidden flex flex-col justify-between min-h-[110px] ${
                    isSelected 
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/10" 
                      : "border-gray-100 dark:border-white/5 bg-white dark:bg-gray-800/40 hover:border-indigo-200 dark:hover:border-indigo-500/30"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg ${opt.color || "bg-purple-500"} flex items-center justify-center text-white mb-2 shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  
                  <div className="font-bold text-gray-800 dark:text-gray-100 text-[12px] leading-tight break-words pr-4">
                    {opt.label}
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white animate-in zoom-in duration-200">
                      <Check size={12} strokeWidth={4} />
                    </div>
                  )}

                  {isCustom && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-gray-800/95 p-1 rounded-lg border border-gray-100 dark:border-white/10 shadow-md z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setEditingFieldId(opt.id);
                          setEditingLabel(opt.label);
                        }}
                        className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 rounded transition-colors"
                        title="Editar campo"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDeletingFieldId(opt.id);
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-colors"
                        title="Eliminar campo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Custom Fields List */}
        {customFields.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t("actions.temp_fields", "Campos Temporales (Sin Guardar)")}</label>
            <div className="flex flex-wrap gap-2">
              {customFields.map(field => (
                <div key={field} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-500/20 px-3 py-1.5 rounded-full animate-in slide-in-from-left-2 duration-200">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{field}</span>
                  <div className="flex items-center gap-1 ml-1 border-l border-amber-200 dark:border-amber-700/50 pl-2">
                    <button 
                      onClick={() => saveToConfig(field)}
                      disabled={isSaving}
                      title="Guardar permanentemente en configuración"
                      className="text-emerald-500 hover:text-emerald-600 transition-colors"
                    >
                      {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    </button>
                    <button onClick={() => {
                      setCustomFields(customFields.filter(f => f !== field));
                      setSelectedIds(selectedIds.filter(f => f !== field));
                    }} className="text-red-400 hover:text-red-500 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Custom Field Input */}
        <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <input
            type="text"
            placeholder={t("actions.data_placeholder", "¿Qué más necesitas? (Ej: Dirección, NIT...)")}
            className="flex-1 bg-transparent px-3 py-2 text-xs outline-none text-gray-700 dark:text-gray-300"
            value={newCustomField}
            onChange={(e) => setNewCustomField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomField()}
          />
          <button 
            onClick={addCustomField}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-md active:scale-90"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-2">
           <button
             onClick={onClose}
             className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-bold rounded-xl hover:bg-gray-200 transition-all"
           >
             {t("actions.cancel", "Cancelar")}
           </button>
           <button
             onClick={handleConfirm}
             className="flex-[2] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
           >
             <Send size={18} />
             {t("actions.request_btn", "SOLICITAR")} {selectedIds.length > 0 ? `(${selectedIds.length})` : ""} {t("actions.data_btn", "DATOS")}
           </button>
        </div>
      </div>
    </Modal>
  );
};
