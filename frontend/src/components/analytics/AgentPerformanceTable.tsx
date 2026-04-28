import React, { useState } from "react";
import { AgentStats } from "@/types";
import { ChevronUp, ChevronDown, Clock, CheckCircle2, Ticket } from "lucide-react";

interface Props {
  data: AgentStats[];
}

export const AgentPerformanceTable: React.FC<Props> = ({ data }) => {
  const [sortField, setSortField] = useState<keyof AgentStats>("totalTickets");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: keyof AgentStats) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedData = [...(data || [])].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];

    if (typeof valA === "string" && typeof valB === "string") {
      return sortDir === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDir === "asc" ? valA - valB : valB - valA;
    }
    return 0;
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const maxTime = Math.max(...(data || []).map(a => a.avgResolutionTime), 120);

  const SortIcon = ({ field }: { field: keyof AgentStats }) => {
    if (sortField !== field) return <ChevronDown className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-50" />;
    return sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />;
  };

  return (
    <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          Rendimiento por Agente
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800/60">
              <th
                className="px-6 py-4 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">Agente <SortIcon field="name" /></div>
              </th>
              <th
                className="px-6 py-4 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-right"
                onClick={() => handleSort("totalTickets")}
              >
                <div className="flex items-center justify-end gap-1"><SortIcon field="totalTickets" /> Tickets Atendidos</div>
              </th>
              <th
                className="px-6 py-4 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-right"
                onClick={() => handleSort("resolvedTickets")}
              >
                <div className="flex items-center justify-end gap-1"><SortIcon field="resolvedTickets" /> Resueltos</div>
              </th>
              <th
                className="px-6 py-4 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors w-64"
                onClick={() => handleSort("avgResolutionTime")}
              >
                <div className="flex items-center gap-1"><SortIcon field="avgResolutionTime" /> Tiempo Promedio</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
            {sortedData.map((agent) => (
              <tr
                key={agent.agentId}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-white dark:ring-[#111b21] group-hover:scale-105 transition-transform">
                      {getInitials(agent.name || "Agente")}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{agent.name || "Agente Desconocido"}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{agent.email || "Sin email"}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
                    <Ticket className="w-3.5 h-3.5" />
                    {agent.totalTickets}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {agent.resolvedTickets}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          agent.avgResolutionTime < 30 ? "bg-emerald-500" :
                          agent.avgResolutionTime < 60 ? "bg-amber-500" : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min((agent.avgResolutionTime / maxTime) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1 w-16 justify-end text-sm font-medium text-gray-700 dark:text-gray-300">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {agent.avgResolutionTime}m
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 mb-3">
                    <Clock className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">No hay datos disponibles</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Intenta con un rango de fechas diferente.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};


