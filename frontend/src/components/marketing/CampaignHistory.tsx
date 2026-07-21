import React from "react";
import { Calendar } from "lucide-react";
import { Campaign } from "@/types";

interface CampaignHistoryProps {
  campaigns: Campaign[];
  historySearch: string;
  onSearchChange: (value: string) => void;
  onEdit: (campaign: Campaign) => void;
  onDelete: (id: string) => void;
}

export const CampaignHistory: React.FC<CampaignHistoryProps> = ({
  campaigns,
  historySearch,
  onSearchChange,
  onEdit,
  onDelete,
}) => (
  <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-sm border border-gray-200 dark:border-reply-border-dark h-full overflow-hidden flex flex-col">
    <div className="p-4 border-b border-gray-200 dark:border-reply-border-dark">
      <input
        type="text"
        placeholder="Buscar campaña..."
        value={historySearch}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark text-sm dark:text-white"
      />
    </div>
    <div className="overflow-y-auto flex-1">
      <table className="w-full text-sm">
        <thead className="text-gray-500 dark:text-gray-400 font-bold border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-border-dark">
          <tr>
            <th className="py-3 px-4 text-left">Campaña</th>
            <th className="py-3 px-4 text-left">Estado</th>
            <th className="py-3 px-4 text-left">Programación / Fecha</th>
            <th className="py-3 px-4 text-right">Entregados</th>
            <th className="py-3 px-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {campaigns.map((c) => (
            <tr key={c.id} className="hover:bg-reply-bg dark:hover:bg-reply-border-dark transition-colors">
              <td className="py-4 px-4">
                <div className="font-bold text-gray-900 dark:text-white">{c.name}</div>
                <div className="text-xs text-gray-400">{c.id.slice(0, 8)}</div>
              </td>
              <td className="py-4 px-4">
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                  c.status === "scheduled" ? "bg-yellow-100 text-yellow-700"
                    : c.status === "processing" ? "bg-blue-100 text-blue-700"
                    : c.status === "completed" ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {c.status === "scheduled" ? "Programada"
                    : c.status === "processing" ? "En Proceso"
                    : c.status === "completed" ? "Completada"
                    : c.status}
                </span>
              </td>
              <td className="py-4 px-4 text-gray-600 dark:text-gray-300">
                {c.status === "scheduled" && c.config?.scheduledAt ? (
                  <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500 font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(c.config.scheduledAt).toLocaleString()}</span>
                  </div>
                ) : (
                  <div className="text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}{" "}
                    <span className="text-xs">{new Date(c.createdAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </td>
              <td className="py-4 px-4 text-right font-mono text-gray-700 dark:text-gray-300">
                {c.stats?.delivered || 0}
              </td>
              <td className="py-4 px-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onEdit(c)} className="text-indigo-600 hover:text-indigo-800 font-bold text-xs">Editar</button>
                  <button onClick={() => onDelete(c.id)} className="text-red-600 hover:text-red-800 font-bold text-xs">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
