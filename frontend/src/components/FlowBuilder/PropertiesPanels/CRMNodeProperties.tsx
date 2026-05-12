import React from "react";
import { NodePropertiesProps } from "./MediaNodeProperties";
import { useTranslation } from "react-i18next";

export const CRMNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  const { t } = useTranslation();
  if (node.type === "create_deal") {
    return (
      <>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
              {t("flow_builder.crm_node.create_deal", "Crear Deal")}
            </p>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {t("flow_builder.crm_node.create_deal_desc", "Crea automáticamente un nuevo negocio en el CRM")}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.deal_title", "Título del Deal")}
            </label>
            <input
              type="text"
              placeholder="Ej: Venta - {{nombre}}"
              value={node.data.title || ""}
              onChange={(e) => onUpdate("title", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t("flow_builder.crm_node.variable_hint", "Puedes usar variables como {{nombre}}, {{email}}")}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.deal_value", "Valor del Deal (Opcional)")}
            </label>
            <input
              type="number"
              placeholder="1000"
              value={node.data.value || ""}
              onChange={(e) => onUpdate("value", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.pipeline", "Pipeline (Opcional)")}
            </label>
            <input
              type="text"
              placeholder="ID del pipeline"
              value={node.data.pipelineId || ""}
              onChange={(e) => onUpdate("pipelineId", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t("flow_builder.crm_node.pipeline_desc", "Si está vacío, usar el pipeline por defecto")}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (node.type === "update_contact") {
    return (
      <>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
              {t("flow_builder.crm_node.update_contact", "Actualizar Contacto")}
            </p>
          </div>
          <p className="text-xs text-indigo-700 dark:text-indigo-400">
            {t("flow_builder.crm_node.update_contact_desc", "Actualiza los campos del contacto con datos capturados")}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.field_name", "Campo: Nombre")}
            </label>
            <input
              type="text"
              placeholder="{{nombre_usuario}}"
              value={node.data.name || ""}
              onChange={(e) => onUpdate("name", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.field_email", "Campo: Email")}
            </label>
            <input
              type="text"
              placeholder="{{email_usuario}}"
              value={node.data.email || ""}
              onChange={(e) => onUpdate("email", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.field_phone", "Campo: Teléfono")}
            </label>
            <input
              type="text"
              placeholder="{{teléfono}}"
              value={node.data.phone || ""}
              onChange={(e) => onUpdate("phone", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
              {t("flow_builder.crm_node.custom_fields", "Campos Personalizados (JSON)")}
            </label>
            <textarea
              rows={3}
              placeholder='{"empresa": "{{empresa}}", "cargo": "{{cargo}}"}'
              value={node.data.customFields || ""}
              onChange={(e) => onUpdate("customFields", e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </>
    );
  }

  return null;
};
