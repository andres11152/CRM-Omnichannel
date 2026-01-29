import React, { useState, useEffect } from 'react';
import { Account } from '../../types/crm';
import { getAccounts, deleteAccount } from '../../services/crmService';
import { AccountModal } from './AccountModal';
import { ModuleHeader } from '../common/ModuleHeader';

export const AccountList: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>(undefined);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta empresa?')) {
      try {
        await deleteAccount(id);
        fetchAccounts();
      } catch (error) {
        console.error('Error deleting account:', error);
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
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        gradient="from-emerald-600 to-teal-600 dark:from-emerald-800 dark:to-teal-800"
        stats={{
          label: "Total Empresas",
          value: accounts.length
        }}
        action={
          <button
            onClick={handleCreate}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Empresa
          </button>
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="bg-reply-panel dark:bg-reply-panel-dark rounded-xl shadow-sm border border-reply-border dark:border-reply-border-dark flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-reply-border dark:border-reply-border-dark text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium">Nombre</th>
                <th className="p-4 font-medium">Industria</th>
                <th className="p-4 font-medium">Tamaño</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Contactos</th>
                <th className="p-4 font-medium">Deals</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-reply-border dark:divide-reply-border-dark">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">Cargando empresas...</td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">No hay empresas registradas.</td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="font-medium text-reply-text dark:text-reply-text-dark">{account.name}</div>
                      {account.website && (
                        <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                          {account.website}
                        </a>
                      )}
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">{account.industry || '-'}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">{account.size || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        account.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        account.status === 'CHURNED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">{account._count?.contacts || 0}</td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">{account._count?.deals || 0}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(account)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-500 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
