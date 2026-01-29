import React, { useState, useEffect } from 'react';
import { Account } from '../../types/crm';
import { createAccount, updateAccount } from '../../services/crmService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  account?: Account;
}

export const AccountModal: React.FC<Props> = ({ isOpen, onClose, onSave, account }) => {
  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    industry: '',
    website: '',
    email: '',
    size: '',
    address: '',
    status: 'ACTIVE'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        industry: account.industry || '',
        website: account.website || '',
        email: account.email || '',
        size: account.size || '',
        address: account.address || '',
        status: account.status
      });
    } else {
      setFormData({
        name: '',
        industry: '',
        website: '',
        email: '',
        size: '',
        address: '',
        status: 'ACTIVE'
      });
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Normalize URL if needed
    let finalData = { ...formData };
    if (finalData.website && !finalData.website.startsWith('http') && finalData.website.includes('.')) {
        finalData.website = `https://${finalData.website}`;
    }

    try {
      if (account) {
        await updateAccount(account.id, finalData);
      } else {
        await createAccount(finalData);
      }
      onSave();
    } catch (error) {
      console.error('Error saving account:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-reply-border dark:border-reply-border-dark">
        <div className="px-6 py-4 border-b border-reply-border dark:border-reply-border-dark flex justify-between items-center">
          <h2 className="text-lg font-bold text-reply-text dark:text-reply-text-dark">
            {account ? 'Editar Empresa' : 'Nueva Empresa'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
              placeholder="Ej. Acme Corp"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industria</label>
              <input
                type="text"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
                placeholder="Ej. Tecnología"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tamaño</label>
              <select
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
              >
                <option value="">Seleccionar...</option>
                <option value="1-10">1-10 empleados</option>
                <option value="11-50">11-50 empleados</option>
                <option value="51-200">51-200 empleados</option>
                <option value="201-500">201-500 empleados</option>
                <option value="500+">500+ empleados</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sitio Web</label>
            <input
              type="text"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
              placeholder="ejemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Corporativo</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
              placeholder="contacto@empresa.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
              rows={2}
              placeholder="Dirección física..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-reply-text dark:text-reply-text-dark focus:ring-2 focus:ring-reply-blue focus:border-transparent"
            >
              <option value="ACTIVE">Activo</option>
              <option value="LEAD">Lead (Potencial)</option>
              <option value="CHURNED">Perdido (Churned)</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-reply-blue hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {account ? 'Guardar Cambios' : 'Crear Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
