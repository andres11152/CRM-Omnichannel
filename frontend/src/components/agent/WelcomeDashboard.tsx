import React from "react";
import {
  Inbox,
  Layers,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { User } from "@/types";

interface WelcomeDashboardProps {
  user?: User | null;
  socketConnected: boolean;
  activeTab: string;
  myTicketsCount: number;
  queueTicketsCount: number;
  resolvedTodayCount: number;
}

export const WelcomeDashboard: React.FC<WelcomeDashboardProps> = ({
  user,
  socketConnected,
  activeTab,
  myTicketsCount,
  queueTicketsCount,
  resolvedTodayCount,
}) => {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-reply-bg-dark overflow-y-auto">
      <div className="w-full max-w-3xl flex flex-col items-center text-center">
        {/* Agent Avatar */}
        <div className="mb-6 relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-4xl font-extrabold shadow-lg shadow-indigo-500/20 border-4 border-white dark:border-reply-bg-dark">
            {user?.name?.charAt(0).toUpperCase() || "A"}
          </div>
          <div
            className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-white dark:border-reply-bg-dark ${socketConnected ? "bg-emerald-500" : "bg-red-500"}`}
          />
        </div>

        {/* Greeting */}
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
          ¡Hola, {user?.name?.split(" ")[0] || "Agente"}!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mb-10 max-w-md">
          {activeTab === "queue"
            ? "Revisa la cola de espera y asígnate tickets para comenzar."
            : "Selecciona una conversación a la izquierda o inicia un nuevo chat."}
        </p>

        {/* Performance Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* Card 1: Inbox */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-xl p-6 border border-gray-100 dark:border-reply-border-dark shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                En Bandeja
              </span>
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Inbox className="w-4 h-4" />
              </div>
            </div>
            <div className="text-4xl font-black text-gray-900 dark:text-white text-left">
              {myTicketsCount}
            </div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider text-left mt-2">
              Chats Activos
            </div>
          </div>

          {/* Card 2: Queue */}
          <div className="bg-white dark:bg-reply-panel-dark rounded-xl p-6 border border-gray-100 dark:border-reply-border-dark shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                Por Asignar
              </span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-4xl font-black text-gray-900 dark:text-white text-left">
              {queueTicketsCount}
            </div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider text-left mt-2">
              En Cola de Espera
            </div>
          </div>

          {/* Card 3: Resolved */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4">
              <CheckCircle className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-emerald-50">
                  Resueltos
                </span>
                <div className="p-2 rounded-lg bg-white/20 text-white backdrop-blur-sm">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-4xl font-black text-white text-left">
                {resolvedTodayCount}
              </div>
              <div className="text-xs text-emerald-100 font-bold uppercase tracking-wider text-left mt-2">
                Desempeño Hoy
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
