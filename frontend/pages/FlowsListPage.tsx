import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../services/apiConfig';

interface Flow {
  id: string;
  name: string;
  triggerType: string;
  triggerConfig: any;
  isActive: boolean;
  nodes: any[];
  edges: any[];
  createdAt: string;
  updatedAt: string;
}

export const FlowsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlows();
  }, []);

  async function fetchFlows() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/flows`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch flows');

      const data = await response.json();
      setFlows(Array.isArray(data) ? data : []);
    }  catch (error) {
      console.error('[FlowsList] Error:', error);
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/flows/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error('[FlowsList] Toggle error:', error);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/flows/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error('[FlowsList] Duplicate error:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar este flujo?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/flows/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchFlows();
    } catch (error) {
      console.error('[FlowsList] Delete error:', error);
    }
  }

  function getTriggerDisplay(trigger: any) {
    if (!trigger) return 'Sin trigger';
    if (typeof trigger === 'string') return trigger;
    return trigger.keyword || trigger.pattern || 'Configurar trigger';
  }

  function formatDate(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    return new Date(date).toLocaleDateString('es-ES');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b141a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b141a] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <span className="text-4xl">🤖</span>
              Chatbot - Mis Flujos
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Gestiona los flujos conversacionales de tu chatbot
            </p>
          </div>
          <button
            onClick={() => navigate('/chatbot/flujos/nuevo')}
            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Flujo
          </button>
        </div>

        {/* Empty State */}
        {flows.length === 0 ? (
          <div className="bg-white dark:bg-[#202c33] rounded-xl p-12 text-center shadow-lg">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Sin flujos creados aún
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Crea tu primer flujo conversacional para automatizar respuestas
            </p>
            <button
              onClick={() => navigate('/chatbot/flujos/nuevo')}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-medium inline-flex items-center gap-2 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Crear Primer Flujo
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="bg-white dark:bg-[#202c33] rounded-xl p-6 shadow-md hover:shadow-lg transition-all border-2 border-transparent hover:border-blue-500/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {flow.name}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        flow.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {flow.isActive ? '● Activo' : '○ Inactivo'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                      <span className="flex items-center gap-1">
                        🔑 Trigger: <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {getTriggerDisplay(flow.triggerConfig)}
                        </span>
                      </span>
                      <span>•</span>
                      <span>{flow.nodes?.length || 0} nodos</span>
                      <span>•</span>
                      <span>Última edición: {formatDate(flow.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/chatbot/flujos/${flow.id}/editar`)}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition flex items-center gap-2"
                      title="Editar flujo"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar
                    </button>

                    <button
                      onClick={() => handleToggle(flow.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition ${
                        flow.isActive
                          ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                      title={flow.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {flow.isActive ? 'Desactivar' : 'Activar'}
                    </button>

                    <button
                      onClick={() => handleDuplicate(flow.id)}
                      className="p-2 text-gray-600 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 transition"
                      title="Duplicar flujo"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>

                    <button
                      onClick={() => handleDelete(flow.id)}
                      className="p-2 text-gray-600 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition"
                      title="Eliminar flujo"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
