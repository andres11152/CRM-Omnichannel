import React, { useState } from "react";

import { AgentStats } from "@/types";

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

  return (
    <div className="bg-white dark:bg-reply-surface-dark rounded-xl border border-gray-100 dark:border-reply-border-dark overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800/50">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <span className="text-xl"></span> Rendimiento de Agentes
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-reply-bg/50 dark:bg-reply-panel-dark text-gray-500 dark:text-gray-400 font-medium">
            <tr>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("name")}
              >
                Agente
              </th>
              <th
                className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("totalTickets")}
              >
                Tickets
              </th>
              <th
                className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("resolvedTickets")}
              >
                Resueltos
              </th>
              <th
                className="px-4 py-3 text-right cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("avgResolutionTime")}
              >
                Tiempo Prom. (min)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedData.map((agent) => (
              <tr
                key={agent.agentId}
                className="hover:bg-reply-bg dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                  <div className="flex flex-col">
                    <span>{agent.name}</span>
                    <span className="text-[10px] text-gray-400 font-normal">
                      {agent.email}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                  {agent.totalTickets}
                </td>
                <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-bold">
                  {agent.resolvedTickets}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      agent.avgResolutionTime < 30
                        ? "bg-green-100 text-green-700"
                        : agent.avgResolutionTime < 120
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {agent.avgResolutionTime}m
                  </span>
                </td>
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-6 text-gray-400">
                  Sin datos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};


