import React, { useState } from "react";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import api from "@/services/apiClient";
import { toast } from "sonner";

/**
 * [STAT] EXPORT BUTTON
 * Triggers CSV/PDF export of analytics data
 */

interface Props {
  type: "agents" | "tickets";
  startDate?: string;
  endDate?: string;
  label?: string;
  className?: string;
}

export const ExportButton: React.FC<Props> = ({
  type,
  startDate,
  endDate,
  label = "Exportar",
  className = "",
}) => {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      setLoading(true);
      setShowMenu(false);

      // Build query params
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      params.append("format", format);

      // Call API
      const response = await api.get(
        `/analytics/export/${type}?${params.toString()}`,
      );

      if (response.data.status === "success") {
        const { downloadUrl, recordCount } = response.data.data;

        // Trigger download by opening in new tab
        const baseURL = import.meta.env.VITE_API_URL || "http://localhost:4000";
        window.open(baseURL + downloadUrl, "_blank");

        toast.success(`Reporte ${format.toUpperCase()} generado`, {
          description: `${recordCount} registros exportados`,
        });
      } else {
        throw new Error("Export failed");
      }
    } catch (error: unknown) {
      console.error("[ExportButton] Error:", error);
      toast.error("Error al generar reporte", {
        description:
          error instanceof Error ? error.message : "Intenta nuevamente",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg
          bg-indigo-600 hover:bg-indigo-700
          text-white text-sm font-medium
          transition-colors duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-sm hover:shadow-md
          ${className}
        `}
        title="Exportar datos"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Generando...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            {label}
          </>
        )}
      </button>

      {/* Format Selection Menu */}
      {showMenu && !loading && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-reply-panel-dark rounded-lg shadow-xl border border-gray-200 dark:border-reply-border-dark z-50 animate-fade-in">
          <div className="p-2">
            <button
              onClick={() => handleExport("csv")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  Exportar CSV
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Excel, Google Sheets
                </p>
              </div>
            </button>

            <button
              onClick={() => handleExport("pdf")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left mt-1"
            >
              <FileText className="w-4 h-4 text-red-600" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white">
                  Exportar PDF
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Presentaciones, impresión
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Backdrop to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
        ></div>
      )}
    </div>
  );
};
