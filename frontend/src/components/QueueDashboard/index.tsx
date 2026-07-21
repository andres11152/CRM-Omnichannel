import React, { useState, useEffect } from "react";
import { Agent, QueueConfig, Ticket } from "@/types";
import { getTickets, updateTicket } from "@/services/ticketService";
import { TicketsKanbanView } from "../TicketsKanbanView";
import { ModuleHeader } from "../common/ModuleHeader";
import { Modal, ModalButton } from "../ui/Modal";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import QueuesConfig from "../QueuesConfig";
import { useQueueAgents } from "./useQueueAgents";
import { MonitorView } from "./MonitorView";
import { QueueAssignmentModal } from "./QueueAssignmentModal";
import { IncomingTicket } from "./TicketCard";

export const QueueDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"monitor" | "config" | "kanban">(
    "monitor",
  );
  const { agents, setAgents, queues, saveAgentQueues } = useQueueAgents();

  // Alert Modal State
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "error" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "error",
  });

  const showAlert = (
    title: string,
    message: string,
    type: "error" | "success" = "error",
  ) => {
    setAlertModal({ isOpen: true, title, message, type });
  };

  // Real Tickets State
  const [tickets, setTickets] = useState<IncomingTicket[]>([]);

  // Helper to map real ticket to UI ticket
  const mapToIncomingTicket = (t: Ticket): IncomingTicket => {
    const created = new Date(t.createdAt);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - created.getTime()) / 60000);

    const channelMap: Record<string, IncomingTicket["channel"]> = {
      WHATSAPP: "whatsapp",
      EMAIL: "email",
      WEB_CHAT: "web",
      INSTAGRAM_DM: "instagram",
    };

    return {
      id: t.id,
      channel: channelMap[t.channel?.toUpperCase()] || "whatsapp",
      clientName: t.contact?.name || "Cliente Desconocido",
      waitTime: diffMins,
      priority: (t.priority?.toLowerCase() || "medium") as
        | "low"
        | "medium"
        | "high",
      department: t.queue?.name || "General",
    };
  };

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const realTickets = await getTickets();
        // Filter only OPEN tickets for the queue
        const openTickets = realTickets.filter(
          (t) => t.status === "OPEN" && !t.assignedToId,
        );
        setTickets(openTickets.map(mapToIncomingTicket));
      } catch (error) {
        console.error("Error fetching tickets:", error);
      }
    };
    fetchTickets();
    // Optional: Poll every 10s
    const interval = setInterval(fetchTickets, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTicketDrop = (agentId: string, ticketId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!agent || !ticket) return;

    // Validation: Check Capacity
    if (agent.currentLoad >= agent.maxCapacity) {
      showAlert(
        "Agente Saturado",
        `El agente ${agent.name} ha alcanzado su capacidad mxima de chats.`,
      );
      return;
    }

    // Success Logic
    // 1. Call API to assign
    updateTicket(ticketId, { assignedToId: agentId })
      .then(() => {
        // 2. Remove ticket from queue (UI update)
        setTickets((prev) => prev.filter((t) => t.id !== ticketId));

        // 3. Update agent load (Optimistic UI update)
        setAgents((prev) =>
          prev.map((a) => {
            if (a.id === agentId) {
              return { ...a, currentLoad: a.currentLoad + 1 };
            }
            return a;
          }),
        );

        console.info(`[OK] Ticket asignado a ${agent.name}`);
      })
      .catch((err) => {
        console.error("Error assigning ticket:", err);
        showAlert(
          "Error de Asignación",
          "No se pudo asignar el ticket. Inténtalo de nuevo.",
        );
      });
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const handleConfigClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsModalOpen(true);
  };

  const handleSaveConfig = async (queueIds: string[]) => {
    if (!selectedAgent) return;
    try {
      await saveAgentQueues(selectedAgent.id, queueIds);
      setIsModalOpen(false);
      setSelectedAgent(null);
      showAlert("¡Éxito!", "Colas asignadas correctamente.", "success");
    } catch (error) {
      console.error("Error updating agent queues", error);
      showAlert("Error", "No se pudieron asignar las colas.");
    }
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark transition-colors duration-200">
      {/* Dynamic Header based on Active Tab */}
      <ModuleHeader
        title={
          activeTab === "monitor"
            ? "Monitor en Vivo"
            : activeTab === "config"
              ? "Configuración de Colas"
              : "Tablero Kanban"
        }
        description={
          activeTab === "monitor"
            ? "Supervisa el estado de los agentes y la cola de espera en tiempo real."
            : activeTab === "config"
              ? "Administra las colas, departamentos y reglas de asignación."
              : "Gestiona el flujo de trabajo de tus tickets con un tablero visual."
        }
        icon={
          activeTab === "monitor" ? (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"
              />
            </svg>
          ) : activeTab === "config" ? (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
          )
        }
        gradient={
          activeTab === "monitor"
            ? "from-blue-600 to-cyan-600 dark:from-blue-800 dark:to-cyan-800"
            : activeTab === "config"
              ? "from-slate-600 to-gray-600 dark:from-slate-800 dark:to-gray-800"
              : "from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800"
        }
        stats={
          activeTab === "monitor"
            ? { label: "Tickets en Cola", value: tickets.length }
            : undefined
        }
      />

      <div className="px-8 py-4 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark">
        <div className="bg-gray-100 dark:bg-reply-surface-dark p-1 rounded-xl inline-flex shadow-inner">
          <button
            onClick={() => setActiveTab("monitor")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "monitor"
                ? "bg-white dark:bg-reply-border-dark text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Monitor en Vivo
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "config"
                ? "bg-white dark:bg-reply-border-dark text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Configuración de Colas
          </button>
          <button
            onClick={() => setActiveTab("kanban")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "kanban"
                ? "bg-white dark:bg-reply-border-dark text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Kanban de Tickets
          </button>
        </div>
      </div>

      {activeTab === "monitor" && (
        <MonitorView
          agents={agents}
          tickets={tickets}
          onTicketDrop={handleTicketDrop}
          onConfigClick={handleConfigClick}
        />
      )}

      {activeTab === "config" && <QueuesConfig />}

      {activeTab === "kanban" && (
        <div className="flex-1 overflow-hidden">
          <TicketsKanbanView />
        </div>
      )}

      <QueueAssignmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        agent={selectedAgent}
        onSave={handleSaveConfig}
        availableQueues={queues}
      />

      {/* Custom Alert Modal */}
      <Modal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        size="sm"
        hideCloseButton
        footer={
          <ModalButton
            variant="primary"
            className="w-full"
            onClick={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
          >
            Entendido
          </ModalButton>
        }
      >
        <div className="flex flex-col items-center text-center py-2">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 ${alertModal.type === "error" ? "bg-red-50 text-red-500 dark:bg-red-900/20" : "bg-green-50 text-green-500 dark:bg-green-900/20"}`}
          >
            {alertModal.type === "error" ? (
              <AlertTriangle className="w-8 h-8" />
            ) : (
              <CheckCircle2 className="w-8 h-8" />
            )}
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {alertModal.title}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            {alertModal.message}
          </p>
        </div>
      </Modal>
    </div>
  );
};
