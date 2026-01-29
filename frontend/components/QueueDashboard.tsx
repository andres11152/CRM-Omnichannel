import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../services/apiConfig";
import { Agent, QueueJob, QueueConfig, Ticket } from "../types";
import { getAgents, updateAgentQueues } from "../services/queueService";
import { getTickets, updateTicket } from "../services/ticketService";
import { TicketsKanbanView } from "./TicketsKanbanView";
import { ModuleHeader } from "./common/ModuleHeader";

import {
  getDepartments,
  createDepartment,
  Department,
} from "../services/departmentService";
import { getAssistants } from "../services/aiService";
import { QueuesConfig } from "./QueuesConfig";

export const QueueDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"monitor" | "config" | "kanban">(
    "monitor",
  );
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<QueueJob[]>([]);

  // Config State
  const [queues, setQueues] = useState<QueueConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assistants, setAssistants] = useState<any[]>([]); // New AI State

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

  // Load initial agents and queues
  useEffect(() => {
    const loadData = async () => {
      let humanAgents: Agent[] = [];

      try {
        const agentsList = await getAgents();
        humanAgents = agentsList;
      } catch (error) {
        console.error("Error loading agents", error);
      }

      try {
        const queuesRes = await fetch(`${API_BASE_URL}/queues`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        });
        if (!queuesRes.ok) throw new Error("Endpoint not found");
        const queuesData = await queuesRes.json();
        const mappedQueues = queuesData.map((q: any) => ({
          ...q,
          departmentDetails: q.department,
          department: q.department?.name || q.department, // Fallback
        }));
        setQueues(mappedQueues);
      } catch (error) {
        console.error("Error loading queues:", error);
        setQueues([]); // No mock fallback
      }

      try {
        const depts = await getDepartments();
        setDepartments(depts);
        setDepartments(depts);
      } catch (error) {
        console.error("Error loading departments", error);
      }

      try {
        const assistantsList = await getAssistants();
        setAssistants(assistantsList);

        // Create virtual AI agents from assistants
        const aiAgents: Agent[] = assistantsList.map((assistant: any) => ({
          id: `ai-${assistant.id}`,
          name: `🤖 ${assistant.name}`,
          email: `IA Gemini ${assistant.modelName || ""}`,
          avatar: "", // Could use a robot icon
          status: "online" as const, // AI is always online
          currentLoad: 0,
          maxCapacity: 999, // Unlimited for AI
          department: "IA Automation",
          role: "AI_AGENT" as any,
          isAI: true, // Flag to identify AI agents
        }));

        // Filter out human agents that have the same name as AI assistants OR look like bots
        const aiNames = assistantsList.map((a: any) =>
          a.name.toLowerCase().trim(),
        );
        const filteredHumanAgents = humanAgents.filter((agent) => {
          const nameMatch = aiNames.includes(agent.name.toLowerCase().trim());
          const isBotEmail = agent.email?.toLowerCase().startsWith("bot_");
          const isMobileUser = agent.email?.toLowerCase().startsWith("mobile_");
          return !nameMatch && !isBotEmail && !isMobileUser;
        });

        // Combine AI agents first, then filtered human agents
        setAgents([...aiAgents, ...filteredHumanAgents]);
      } catch (error) {
        console.error("Error loading assistants", error);
        // If AI loading fails, just show human agents
        setAgents(humanAgents);
      }
    };
    loadData();
  }, []);

  // Polling to keep UI in sync (Disabled for Mock Mode)
  useEffect(() => {
    /*
    const interval = setInterval(async () => {
      try {
        const agentsList = await getAgents();
        setAgents(agentsList);
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 5000); // Increased polling interval
    return () => clearInterval(interval);
    */
  }, []);

  // Real Tickets State
  const [tickets, setTickets] = useState<IncomingTicket[]>([]);

  // Helper to map real ticket to UI ticket
  const mapToIncomingTicket = (t: Ticket): IncomingTicket => {
    const created = new Date(t.createdAt);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - created.getTime()) / 60000);

    return {
      id: t.id,
      channel: "whatsapp", // Default or derive from source
      clientName: t.contact?.name || "Cliente Desconocido",
      waitTime: diffMins,
      priority: (t.priority?.toLowerCase() || "medium") as any,
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

    // Validation: Check Status
    if (agent.status !== "online") {
      showAlert(
        "Agente No Disponible",
        `El agente ${agent.name} no está en línea para recibir tickets.`,
      );
      return;
    }

    // Validation: Check Capacity
    if (agent.currentLoad >= agent.maxCapacity) {
      showAlert(
        "Agente Saturado",
        `El agente ${agent.name} ha alcanzado su capacidad máxima de chats.`,
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

        // Optional: Show success toast instead of modal for flow
        console.log(`✅ Ticket asignado a ${agent.name}`);
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
    if (selectedAgent) {
      try {
        const updatedUser = await updateAgentQueues(selectedAgent.id, queueIds);

        setAgents((prev) =>
          prev.map((a) => {
            if (a.id === selectedAgent.id) {
              // Update local state with new queues
              const queueNames = queues
                .filter((q) => queueIds.includes(q.id))
                .map((q) => q.name);
              return {
                ...a,
                queues: queues
                  .filter((q) => queueIds.includes(q.id))
                  .map((q) => ({ id: q.id, name: q.name })),
                department: queueNames.join(", "),
              };
            }
            return a;
          }),
        );

        setIsModalOpen(false);
        setSelectedAgent(null);
        showAlert("¡Éxito!", "Colas asignadas correctamente.", "success");
      } catch (error) {
        console.error("Error updating agent queues", error);
        showAlert("Error", "No se pudieron asignar las colas.");
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a] transition-colors duration-200">
      {/* Tab Header */}
      {/* Tab Header */}
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
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"
              />
            </svg>
          ) : activeTab === "config" ? (
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            ? {
                label: "Tickets en Cola",
                value: tickets.length,
              }
            : undefined
        }
      />

      <div className="px-8 py-4 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-gray-700">
        <div className="bg-gray-100 dark:bg-[#111b21] p-1 rounded-xl inline-flex shadow-inner">
          <button
            onClick={() => setActiveTab("monitor")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "monitor"
                ? "bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Monitor en Vivo
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "config"
                ? "bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Configuración de Colas
          </button>
          <button
            onClick={() => setActiveTab("kanban")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === "kanban"
                ? "bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Kanban de Tickets
          </button>
        </div>
      </div>

      {/* MONITOR VIEW */}
      {activeTab === "monitor" && (
        <div className="flex-1 p-8 overflow-hidden flex flex-col gap-6">
          {/* KPI Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* AI Agents Online */}
            <div className="bg-white dark:bg-[#202c33] p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Agentes IA Online
                </p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {agents.filter((a) => (a as any).isAI).length}
                </h3>
              </div>
            </div>

            <div className="bg-white dark:bg-[#202c33] p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Agentes Online
                </p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {
                    agents.filter(
                      (a) => a.status === "online" && !(a as any).isAI,
                    ).length
                  }{" "}
                  <span className="text-sm font-normal text-gray-400">
                    / {agents.filter((a) => !(a as any).isAI).length}
                  </span>
                </h3>
              </div>
            </div>

            <div className="bg-white dark:bg-[#202c33] p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                <svg
                  className="w-6 h-6"
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
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Tiempo Promedio Espera
                </p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {tickets.length > 0
                    ? Math.round(
                        tickets.reduce((acc, t) => acc + (t.waitTime || 0), 0) /
                          tickets.length,
                      )
                    : 0}{" "}
                  <span className="text-sm font-normal text-gray-400">min</span>
                </h3>
              </div>
            </div>

            <div className="bg-white dark:bg-[#202c33] p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-lg text-rose-600 dark:text-rose-400">
                <svg
                  className="w-6 h-6"
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
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Tickets en Cola
                </p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {tickets.length}
                </h3>
              </div>
            </div>
          </div>

          <div className="flex-1 flex gap-8 overflow-hidden">
            {/* Agents List */}
            <div className="w-2/3 flex flex-col gap-4 overflow-hidden">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  Agentes Activos
                  <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">
                    {agents.length}
                  </span>
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {agents.length === 0 ? (
                  <div className="text-center text-gray-500 py-10 bg-gray-50 dark:bg-[#111b21] rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    No hay agentes conectados
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {agents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        onDrop={handleTicketDrop}
                        onConfigClick={handleConfigClick}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Queue List */}
            <div className="w-1/3 flex flex-col gap-4 overflow-hidden">
              <div className="bg-white dark:bg-[#202c33] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-[#111b21]/50">
                  <h3 className="font-bold text-gray-800 dark:text-white">
                    Cola de Espera
                  </h3>
                  <span className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-xs font-bold px-2 py-0.5 rounded-full">
                    {tickets.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30 dark:bg-[#0b141a]/30">
                  {tickets.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                      <svg
                        className="w-12 h-12 mb-3 opacity-20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p>¡Todo al día!</p>
                      <p className="text-xs opacity-70">
                        No hay tickets en espera
                      </p>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <TicketCard key={ticket.id} ticket={ticket} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIG VIEW */}
      {activeTab === "config" && <QueuesConfig />}

      {/* KANBAN VIEW */}
      {activeTab === "kanban" && (
        <div className="flex-1 overflow-hidden">
          <TicketsKanbanView />
        </div>
      )}
      {/* Modal */}
      <QueueAssignmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        agent={selectedAgent}
        onSave={handleSaveConfig}
        availableQueues={queues}
      />

      {/* Custom Alert Modal */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
          <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100 border border-gray-100 dark:border-gray-700">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 mx-auto ${alertModal.type === "error" ? "bg-red-50 text-red-500 dark:bg-red-900/20" : "bg-green-50 text-green-500 dark:bg-green-900/20"}`}
            >
              {alertModal.type === "error" ? (
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
              {alertModal.title}
            </h3>
            <p className="text-center text-gray-500 dark:text-gray-400 mb-8 text-sm leading-relaxed">
              {alertModal.message}
            </p>
            <button
              onClick={() =>
                setAlertModal((prev) => ({ ...prev, isOpen: false }))
              }
              className="w-full py-3 rounded-xl font-bold text-white transition-all transform active:scale-95 bg-gray-900 hover:bg-black dark:bg-indigo-600 dark:hover:bg-indigo-700 shadow-lg shadow-indigo-500/20"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- MOCK DATA & TYPES ---

interface IncomingTicket {
  id: string;
  channel: "whatsapp" | "email" | "web";
  clientName: string;
  waitTime: number; // minutes
  priority: "high" | "medium" | "low";
  department: string;
}

// --- COMPONENTS ---

const TicketCard = ({ ticket }: { ticket: IncomingTicket }) => {
  const isOverdue = ticket.waitTime > 15;
  const isCritical = ticket.waitTime > 30;

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return (
          <span className="text-green-500">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
          </span>
        );
      case "email":
        return (
          <span className="text-blue-500">
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </span>
        );
      default:
        return (
          <span className="text-gray-500">
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
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          </span>
        );
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "high":
        return "border-l-red-500";
      case "medium":
        return "border-l-orange-500";
      case "low":
        return "border-l-green-500";
      default:
        return "border-l-gray-300";
    }
  };

  return (
    <div
      className={`bg-white dark:bg-[#202c33] p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all cursor-move group border-l-4 ${getPriorityColor(ticket.priority)}`}
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.setData("ticketId", ticket.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gray-50 dark:bg-[#111b21] rounded-md">
            {getChannelIcon(ticket.channel)}
          </div>
          <div>
            <span className="block font-bold text-sm text-gray-800 dark:text-white leading-tight">
              {ticket.clientName}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
              {ticket.channel}
            </span>
          </div>
        </div>
        {isOverdue && (
          <span
            className={`flex h-2 w-2 rounded-full ${isCritical ? "bg-red-500 animate-ping" : "bg-orange-500"}`}
          ></span>
        )}
      </div>

      <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
          {ticket.department}
        </span>
        <span
          className={`text-[10px] font-mono font-medium ${isCritical ? "text-red-600 dark:text-red-400" : isOverdue ? "text-orange-600 dark:text-orange-400" : "text-gray-500"}`}
        >
          {ticket.waitTime} min espera
        </span>
      </div>
    </div>
  );
};

// --- QUEUE CONFIGURATION MODAL ---

const QueueAssignmentModal = ({
  isOpen,
  onClose,
  agent,
  onSave,
  availableQueues,
}: {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
  onSave: (queues: string[]) => void;
  availableQueues: QueueConfig[];
}) => {
  const [selectedQueues, setSelectedQueues] = useState<string[]>([]);

  useEffect(() => {
    if (agent) {
      // Use agent.queues if available, otherwise fallback to department parsing or empty
      const current = agent.queues?.map((q) => q.id) || [];
      setSelectedQueues(current);
    }
  }, [agent]);

  if (!isOpen || !agent) return null;

  const toggleQueue = (queueId: string) => {
    setSelectedQueues((prev) =>
      prev.includes(queueId)
        ? prev.filter((q) => q !== queueId)
        : [...prev, queueId],
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-xl w-96 p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Configurar Colas para {agent.name}
        </h3>

        <div className="space-y-3 mb-6">
          {availableQueues.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay colas disponibles.</p>
          ) : (
            availableQueues.map((queue) => (
              <label
                key={queue.id}
                className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
              >
                <input
                  type="checkbox"
                  checked={selectedQueues.includes(queue.id)}
                  onChange={() => toggleQueue(queue.id)}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {queue.name}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(selectedQueues)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};

const AgentCard = ({
  agent,
  onDrop,
  onConfigClick,
}: {
  agent: Agent;
  onDrop: (agentId: string, ticketId: string) => void;
  onConfigClick: (agent: Agent) => void;
}) => {
  const maxCap =
    agent.maxCapacity && agent.maxCapacity > 0 ? agent.maxCapacity : 5; // Default to 5 if invalid
  const loadPercentage = Math.min((agent.currentLoad / maxCap) * 100, 100);

  let progressColor = "bg-emerald-500";
  if (loadPercentage > 60) progressColor = "bg-amber-500";
  if (loadPercentage >= 90) progressColor = "bg-rose-500";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("ticketId");
    if (ticketId) {
      onDrop(agent.id, ticketId);
    }
  };

  return (
    <div
      className={`group bg-white dark:bg-[#202c33] p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 ${agent.currentLoad >= maxCap ? "opacity-90" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-4">
        {/* Avatar & Status */}
        <div className="relative">
          <div
            className={`w-12 h-12 rounded-full p-0.5 ${agent.status === "online" ? "bg-gradient-to-tr from-green-400 to-green-600" : "bg-gray-200 dark:bg-gray-700"}`}
          >
            <img
              src={
                agent.avatar ||
                `https://ui-avatars.com/api/?name=${agent.name}&background=random`
              }
              alt={agent.name}
              className="w-full h-full rounded-full object-cover border-2 border-white dark:border-[#202c33]"
            />
          </div>
          <div
            className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-white dark:border-[#202c33] rounded-full flex items-center justify-center ${
              agent.status === "online"
                ? "bg-green-500"
                : agent.status === "busy"
                  ? "bg-red-500"
                  : "bg-gray-400"
            }`}
          >
            {agent.status === "online" && (
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
            )}
          </div>
        </div>

        {/* Info & Stats */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                {agent.name}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {agent.email}
              </p>
            </div>
            <button
              onClick={() => onConfigClick(agent)}
              className={`text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 ${(agent as any).isAI ? "hidden" : ""}`}
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[11px] font-medium mb-1.5">
              <span className="text-gray-500 dark:text-gray-400">
                Capacidad
              </span>
              <span
                className={`${loadPercentage >= 90 ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                {agent.currentLoad} <span className="text-gray-400">/</span>{" "}
                {maxCap}
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden border border-gray-100 dark:border-gray-600">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${progressColor} ${loadPercentage >= 100 ? "animate-pulse" : ""}`}
                style={{ width: `${loadPercentage}%` }}
              ></div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {agent.department && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                {typeof agent.department === "object"
                  ? (agent.department as any).name
                  : agent.department}
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
              {agent.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
