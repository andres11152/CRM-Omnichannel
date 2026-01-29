import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Activity } from '../../types/crm';
import { getActivities, deleteActivity, updateActivity } from '../../services/crmService';
import { ActivityModal } from './ActivityModal';
import { ModuleHeader } from '../common/ModuleHeader';

export const ActivityList: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | undefined>(undefined);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const data = await getActivities();
      setActivities(data.activities || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleDelete = (id: string) => {
    console.log('🛑 [ActivityList] Requesting delete for Activity ID:', id);

    toast('¿Estás seguro de eliminar esta actividad?', {
      description: 'Esta acción no se puede deshacer',
      action: {
        label: 'Eliminar',
        onClick: async () => {
             const toastId = toast.loading('Eliminando actividad...');
             try {
                console.log('🚀 [ActivityList] Calling deleteService...');
                await deleteActivity(id);
                console.log('✅ [ActivityList] Delete successful.');
                
                toast.success('Actividad eliminada', { id: toastId });
                await fetchActivities();
             } catch (error) {
                console.error('❌ [ActivityList] Error deleting activity:', error);
                toast.error('Error al eliminar actividad', { id: toastId });
             }
        }
      },
      cancel: {
        label: 'Cancelar',
        onClick: () => console.log('❌ [ActivityList] Delete cancelled by user.')
      },
      duration: 5000, // Give user time to decide
    });
  };

  const handleStatusToggle = async (activity: Activity) => {
    try {
      const newStatus = activity.status === 'PENDING' ? 'COMPLETED' : 'PENDING';
      await updateActivity(activity.id, { status: newStatus });
      fetchActivities();
    } catch (error) {
      console.error('Error updating activity status:', error);
    }
  };

  const handleEdit = (activity: Activity) => {
    setSelectedActivity(activity);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedActivity(undefined);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedActivity(undefined);
    fetchActivities();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'CALL':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
      case 'EMAIL':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
      case 'MEETING':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
      case 'TASK':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
      default: // NOTE
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'NOTE': 'Nota',
      'CALL': 'Llamada',
      'EMAIL': 'Email',
      'MEETING': 'Reunión',
      'TASK': 'Tarea'
    };
    return labels[type] || type;
  };


  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark overflow-hidden">


      <ModuleHeader
        title="Actividades"
        description="Gestiona tus tareas y recordatorios"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
          </svg>
        }
        gradient="from-orange-600 to-amber-600 dark:from-orange-800 dark:to-amber-800"
        stats={{
          label: "Pendientes",
          value: activities.filter(a => a.status === 'PENDING').length
        }}
        action={
          <button
            onClick={handleCreate}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Actividad
          </button>
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="bg-reply-panel dark:bg-reply-panel-dark rounded-xl shadow-sm border border-reply-border dark:border-reply-border-dark flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-reply-border dark:border-reply-border-dark text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium w-10"></th>
                <th className="p-4 font-medium">Asunto</th>
                <th className="p-4 font-medium">Tipo</th>
                <th className="p-4 font-medium">Vencimiento</th>
                <th className="p-4 font-medium">Asignado a</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-reply-border dark:divide-reply-border-dark">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">Cargando actividades...</td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No hay actividades pendientes.</td>
                </tr>
              ) : (
                activities.map((activity) => (
                  <tr key={activity.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group ${activity.status === 'COMPLETED' ? 'opacity-50' : ''}`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={activity.status === 'COMPLETED'}
                        onChange={() => handleStatusToggle(activity)}
                        className="w-4 h-4 text-reply-blue rounded border-gray-300 focus:ring-reply-blue cursor-pointer"
                      />
                    </td>
                    <td className="p-4">
                      <div className={`font-medium text-reply-text dark:text-reply-text-dark ${activity.status === 'COMPLETED' ? 'line-through' : ''}`}>
                        {activity.subject}
                      </div>
                      {activity.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {activity.description}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                        {getTypeIcon(activity.type)}
                        {getTypeLabel(activity.type)}
                      </span>
                    </td>
                    <td className="p-4">
                      {activity.dueDate ? (
                        <span className={`text-sm ${
                          new Date(activity.dueDate) < new Date() && activity.status !== 'COMPLETED'
                            ? 'text-red-500 font-medium'
                            : 'text-gray-600 dark:text-gray-300'
                        }`}>
                          {new Date(activity.dueDate).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">
                      {activity.assignedTo?.name || '-'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(activity)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-500 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(activity.id)}
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
        <ActivityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleModalClose}
          activity={selectedActivity}
        />
      )}
    </div>
  );
};
