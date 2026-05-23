import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "@/services/apiConfig";
import { Contact } from "@/types";
import { DealModal } from "./crm/DealModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { User, History, Mail, Phone, TrendingUp, Plus } from "lucide-react";

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
    <div className="bg-reply-panel dark:bg-reply-panel-dark border-b border-reply-border dark:border-reply-border-dark px-4 py-4 space-y-4">
      {/* Contact Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-reply-text-primary dark:text-white flex items-center gap-2">
            <User className="w-4 h-4 text-reply-brand" />
            Información de Contacto
          </h3>
        </div>
        {onOpenTimeline && (
          <Button
            onClick={onOpenTimeline}
            variant="ghost"
            size="sm"
            className="text-reply-brand dark:text-reply-brand-light font-bold hover:bg-reply-brand/5 p-0 h-auto flex items-center gap-1 text-xs"
          >
            <History className="w-3.5 h-3.5" />
            Línea de Tiempo
          </Button>
        )}
      </div>

      {/* Contact Details */}
      <div className="space-y-2 text-xs">
        {contact.email &&
          contact.email !== "null@example.com" &&
          !contact.email.includes("@whatsapp") && (
            <div className="flex items-center gap-2 text-reply-text-secondary dark:text-reply-text-secondary-dark">
              <Mail className="w-3.5 h-3.5 text-reply-text-secondary/50 dark:text-reply-text-secondary-dark/50" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-reply-text-secondary dark:text-reply-text-secondary-dark">
            <Phone className="w-3.5 h-3.5 text-reply-text-secondary/50 dark:text-reply-text-secondary-dark/50" />
            <span>{contact.phone}</span>
          </div>
        )}
      </div>

      {/* Deals Summary */}
      <div className="pt-3 border-t border-reply-border dark:border-reply-border-dark">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-reply-text-secondary/80 dark:text-reply-text-secondary-dark/80 uppercase flex items-center gap-1.5 tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-reply-brand" />
            Pipeline
          </h4>
        </div>

        {loading ? (
          <div className="text-xs text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 italic">Cargando...</div>
        ) : activeDeals.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Card className="p-2.5 border-reply-border dark:border-reply-border-dark bg-reply-bg/50 dark:bg-reply-bg-dark/30 flex flex-col justify-between">
                <div className="text-[9px] font-black text-reply-text-secondary/70 dark:text-reply-text-secondary-dark/70 uppercase tracking-wider mb-1 leading-none">
                  Oportunidades Activas
                </div>
                <div className="text-base font-black text-reply-brand dark:text-reply-brand-light font-mono leading-none">
                  {activeDeals.length}
                </div>
              </Card>
              <Card className="p-2.5 border-reply-border dark:border-reply-border-dark bg-reply-bg/50 dark:bg-reply-bg-dark/30 flex flex-col justify-between">
                <div className="text-[9px] font-black text-reply-text-secondary/70 dark:text-reply-text-secondary-dark/70 uppercase tracking-wider mb-1 leading-none">
                  Negocios Cerrados
                </div>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none">
                  ${(totalWonValue / 1000).toFixed(1)}K
                </div>
              </Card>
            </div>

            {/* Active Deals List */}
            <div className="space-y-2">
              {activeDeals.slice(0, 3).map((deal) => (
                <Card
                  key={deal.id}
                  hoverable
                  className="p-2.5 bg-reply-bg/50 dark:bg-reply-bg-dark/30 border-reply-border/50 dark:border-reply-border-dark/50 hover:border-reply-brand/30 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="font-bold text-reply-text-primary dark:text-white line-clamp-1 flex-1 text-xs">
                      {deal.title}
                    </span>
                    <span className="text-xs font-black text-reply-text-secondary dark:text-reply-text-secondary-dark whitespace-nowrap font-mono">
                      ${(deal.value / 1000).toFixed(1)}K
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant="neutral" className="text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wide bg-reply-bg dark:bg-reply-bg-dark border-reply-border dark:border-reply-border-dark text-reply-text-secondary">
                      {deal.stage?.name || "Sin etapa"}
                    </Badge>
                    <span className="text-[10px] text-reply-text-secondary/60 dark:text-reply-text-secondary-dark/60 font-mono">
                      {deal.probability}% prob.
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-reply-text-secondary dark:text-reply-text-secondary-dark italic text-center py-4 border border-dashed border-reply-border dark:border-reply-border-dark rounded-xl bg-reply-bg/30 dark:bg-reply-bg-dark/10 flex flex-col items-center gap-2">
            <span>No hay oportunidades activas</span>
            <Button
              onClick={() => setShowDealModal(true)}
              variant="ghost"
              size="sm"
              className="text-reply-brand dark:text-reply-brand-light font-bold flex items-center gap-1 py-1 px-2.5 h-auto text-xs hover:bg-reply-brand/5"
            >
              <Plus className="w-3.5 h-3.5" />
              Crear la primera
            </Button>
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
