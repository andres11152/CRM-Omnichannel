import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/services/apiConfig";
import { Contact } from "@/types";
import { DealModal } from "./crm/DealModal";

interface Deal {
  id: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  stage: {
    name: string;
    color?: string;
  };
  createdAt: string;
}

interface Props {
  contact: Contact;
  onOpenTimeline?: () => void;
}

const ContactCRMInfoComponent: React.FC<Props> = ({
  contact,
  onOpenTimeline,
}) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDealModal, setShowDealModal] = useState(false);

  useEffect(() => {
    fetchDeals();
  }, [contact.id, contact.realContactId]);

  const fetchDeals = async () => {
    try {
      const token = localStorage.getItem("token");
      // Use realContactId (UUID) if available (Ticket View), otherwise fallback to id (Direct Contact View)
      const targetId = contact.realContactId || contact.id;
      const res = await fetch(`${API_BASE_URL}/deals?contactId=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setDeals(data.data?.deals || []);
      }
    } catch (error) {
      console.error("Error fetching deals", error);
    } finally {
      setLoading(false);
    }
  };

  const activeDeals = deals.filter(
    (d) => d.stage?.name !== "Ganado" && d.stage?.name !== "Perdido",
  );

  const wonDeals = deals.filter((d) => d.stage?.name === "Ganado");
  const totalWonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark px-4 py-3 space-y-3">
      {/* Contact Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <svg
              className="w-4 h-4 text-indigo-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Información de Contacto
          </h3>
        </div>
        {onOpenTimeline && (
          <button
            onClick={onOpenTimeline}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1"
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Línea de Tiempo
          </button>
        )}
      </div>

      {/* Contact Details */}
      <div className="space-y-2 text-xs">
        {contact.email &&
          contact.email !== "null@example.com" &&
          !contact.email.includes("@whatsapp") && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <svg
                className="w-3.5 h-3.5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <svg
              className="w-3.5 h-3.5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <span>{contact.phone}</span>
          </div>
        )}
      </div>

      {/* Deals Summary */}
      <div className="pt-3 border-t border-gray-100 dark:border-reply-border-dark">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-1">
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
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Pipeline
          </h4>
        </div>

        {loading ? (
          <div className="text-xs text-gray-400 italic">Cargando...</div>
        ) : activeDeals.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded border border-indigo-100 dark:border-indigo-800">
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
                  Oportunidades Activas
                </div>
                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {activeDeals.length}
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-100 dark:border-green-800">
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
                  Negocios Cerrados
                </div>
                <div className="text-sm font-bold text-green-600 dark:text-green-400">
                  ${(totalWonValue / 1000).toFixed(1)}K
                </div>
              </div>
            </div>

            {/* Active Deals List */}
            <div className="space-y-1.5">
              {activeDeals.slice(0, 3).map((deal) => (
                <div
                  key={deal.id}
                  className="bg-reply-bg dark:bg-gray-800/50 p-2 rounded text-xs group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="font-medium text-gray-800 dark:text-gray-200 line-clamp-1 flex-1">
                      {deal.title}
                    </span>
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      ${(deal.value / 1000).toFixed(1)}K
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                      {deal.stage?.name || "Sin etapa"}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {deal.probability}% prob.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic text-center py-4 border border-dashed border-gray-200 dark:border-reply-border-dark rounded bg-reply-bg dark:bg-gray-800/30">
            No hay oportunidades activas
            <button
              onClick={() => setShowDealModal(true)}
              className="block mx-auto mt-1 text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Crear la primera
            </button>
          </div>
        )}
      </div>

      {/* Deal Modal */}
      {showDealModal && (
        <DealModal
          isOpen={showDealModal}
          onClose={() => setShowDealModal(false)}
          onSave={() => {
            fetchDeals();
            setShowDealModal(false);
          }}
          deal={
            {
              // Pre-fill minimal data for new deal linked to this contact
              title: "",
              value: 0,
              currency: "USD",
              probability: 10,
              contactId: contact.realContactId || contact.id, // Link to this contact
              accountId: "", // Or fetch account if needed
            } as unknown as import("@/types/crm").Deal
          }
        />
      )}
    </div>
  );
};

export const ContactCRMInfo = React.memo(ContactCRMInfoComponent);
