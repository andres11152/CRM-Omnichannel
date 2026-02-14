import React, { useState, useEffect } from "react";
import { Account } from "@/types/crm";
import { Search, Building2, Trash2, Users, Settings } from "lucide-react";

import { getAccounts, deleteAccount } from "@/services/crmService";
import { AccountModal } from "./AccountModal";
import { ModuleHeader } from "../common/ModuleHeader";

export const AccountList: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>(
    undefined,
  );

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro de eliminar esta empresa?")) {
      try {
        await deleteAccount(id);
        fetchAccounts();
      } catch (error) {
        console.error("Error deleting account:", error);
      }
    }
  };

  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedAccount(undefined);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAccount(undefined);
    fetchAccounts();
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">
      <ModuleHeader
        title="Empresas"
        description="Gestiona tus clientes B2B"
        icon={
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        }
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
        stats={{
          label: "Total Empresas",
          value: accounts.length,
        }}
        action={
          <button
            onClick={handleCreate}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nueva Empresa
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="relative group flex-1 max-w-2xl">
              <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por nombre, industria o sitio web..."
                className="w-full pl-12 pr-6 py-4 bg-white dark:bg-reply-panel-dark border border-gray-100 dark:border-reply-border-dark rounded-2xl shadow-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none font-medium text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-100 dark:border-reply-border-dark shadow-sm text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {accounts.length} Empresas
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-64 bg-white dark:bg-reply-panel-dark rounded-[2.5rem] border border-gray-100 dark:border-reply-border-dark animate-pulse"
                />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-reply-panel-dark rounded-[3rem] border border-dashed border-gray-200 dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                No hay empresas registradas
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                Comienza a construir tu portafolio B2B agregando la primera
                compañía.
              </p>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="bg-white dark:bg-reply-surface-dark p-6 rounded-[2.5rem] border border-gray-100 dark:border-reply-border-dark shadow-sm transition-all relative overflow-hidden"
                  >
                    <div className="flex items-center gap-4 mb-5">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-emerald-500/20">
                        {account.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-black text-gray-900 dark:text-white truncate">
                          {account.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${account.status === "ACTIVE" ? "bg-emerald-500" : "bg-gray-400"}`}
                          />
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            {account.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400 font-bold uppercase tracking-tighter">
                          Industria
                        </span>
                        <span className="text-gray-900 dark:text-white font-black">
                          {account.industry || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400 font-bold uppercase tracking-tighter">
                          Equipo
                        </span>
                        <span className="text-gray-900 dark:text-white font-black">
                          {account.size || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-reply-border-dark">
                        <div className="flex gap-4">
                          <div className="text-center">
                            <div className="text-xs font-black text-gray-900 dark:text-white">
                              {account._count?.contacts || 0}
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase">
                              Contactos
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs font-black text-gray-900 dark:text-white">
                              {account._count?.deals || 0}
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase">
                              Deals
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(account)}
                        className="flex-1 py-4 bg-reply-bg dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold text-sm transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="p-4 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-100 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE */}
              <div className="hidden md:block bg-white dark:bg-reply-surface-dark rounded-[3rem] border border-gray-100 dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-reply-bg/50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                      <th className="px-10 py-8">Compañía</th>
                      <th className="px-6 py-8">Industria & Tamaño</th>
                      <th className="px-6 py-8">Estado</th>
                      <th className="px-6 py-8 text-center">Métricas CRM</th>
                      <th className="px-10 py-8 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {accounts.map((account) => (
                      <tr
                        key={account.id}
                        className="hover:bg-reply-bg/50 dark:hover:bg-emerald-500/[0.02] transition-all group"
                      >
                        <td className="px-10 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-[1.25rem] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black shadow-lg shadow-emerald-500/10 border-2 border-white dark:border-reply-border-dark transform group-hover:scale-110 group-hover:rotate-2 transition-all duration-500">
                              {account.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-lg font-black text-gray-900 dark:text-white mb-0.5 tracking-tight">
                                {account.name}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {account.website && (
                                  <a
                                    href={account.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-black text-emerald-500 hover:text-emerald-600 uppercase tracking-widest flex items-center gap-1"
                                  >
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    {account.website
                                      .replace("https://", "")
                                      .replace("www.", "")}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-sm font-black text-gray-900 dark:text-white">
                              {account.industry || "No especificado"}
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                              <Users className="w-3 h-3" />
                              {account.size || "Tamaño desconocido"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <span
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                              account.status === "ACTIVE"
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20 shadow-sm shadow-emerald-500/10"
                                : account.status === "CHURNED"
                                  ? "bg-red-50 dark:bg-red-500/10 text-red-600 border-red-100 dark:border-red-500/20"
                                  : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-100 dark:border-amber-500/20"
                            }`}
                          >
                            {account.status}
                          </span>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center justify-center gap-8">
                            <div className="text-center">
                              <div className="text-lg font-black text-gray-900 dark:text-white">
                                {account._count?.contacts || 0}
                              </div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                Contactos
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-black text-gray-900 dark:text-white">
                                {account._count?.deals || 0}
                              </div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                Deals
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6 whitespace-nowrap text-right">
                          <div className="flex justify-end items-center gap-3">
                            <button
                              onClick={() => handleEdit(account)}
                              className="p-3 bg-white dark:bg-gray-800 hover:bg-emerald-600 hover:text-white text-gray-400 rounded-2xl transition-all shadow-sm border border-gray-100 dark:border-reply-border-dark group-hover:scale-105"
                              title="Configuración de cuenta"
                            >
                              <Settings className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(account.id)}
                              className="p-3 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-300 hover:text-red-500 rounded-2xl transition-all active:scale-95"
                              title="Eliminar Empresa"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <AccountModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleModalClose}
          account={selectedAccount}
        />
      )}
    </div>
  );
};


