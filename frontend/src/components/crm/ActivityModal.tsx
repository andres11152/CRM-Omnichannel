import React, { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { 
  Calendar, 
  CheckSquare, 
  Mail, 
  Phone, 
  FileText, 
  CalendarClock, 
  User, 
  Building2,
  ClipboardList,
  X,
  Info,
  AlertTriangle,
  Users,
  Briefcase,
  CheckCircle2
} from 'lucide-react';
import { Activity, Account, Deal } from '@/types/crm';
import { createActivity, updateActivity, getAccounts, getDeals, getContacts } from '@/services/crmService';
import { fetchAPI } from '@/services/apiConfig';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  activity?: Activity;
  initialType?: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'TASK';
  preselectedContact?: { id: string; name: string; email?: string; companyId?: string; isCompany?: boolean };
}

interface User {
  id: string;
  name: string;
  email: string;
}

export const ActivityModal: React.FC<Props> = ({ isOpen, onClose, onSave, activity, initialType = 'NOTE', preselectedContact }) => {
  const [formData, setFormData] = useState<Partial<Activity>>({
    type: initialType,
    subject: '',
    description: '',
    status: 'PENDING',
    dueDate: '',
    accountId: '',
    dealId: '',
    contactId: '',
    assignedToId: '',
    participantIds: [] as string[]
  });
  const [markAsCompleted, setMarkAsCompleted] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isClientMode, setIsClientMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsData, dealsData, contactsData, usersData] = await Promise.all([
          getAccounts(),
          getDeals(),
          getContacts(),
          fetchAPI('/users')
        ]);
        setAccounts(accountsData.accounts || []);
        setDeals(dealsData.deals || []);
        setContacts(contactsData.contacts || []);
        
        const realUsers = (usersData.data?.users || []).filter((user: User) => {
          const email = user.email?.toLowerCase() || '';
          const name = user.name?.toLowerCase() || '';
          
          return !email.includes('whatsapp.user') && 
                 !email.includes('@bot') &&
                 !name.includes('whatsapp') &&
                 !name.includes('master') &&
                 !name.includes('experto en retiro');
        });
        
        setUsers(realUsers);
        
        if (!activity) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const decoded: any = jwtDecode(token);
                    setFormData(prev => ({ ...prev, assignedToId: decoded.id }));
                }
            } catch (e) {
                console.error('Error decoding token:', e);
            }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();

    if (activity) {
      let dueDateValue = '';
      if (activity.dueDate) {
        const date = new Date(activity.dueDate);
        const pad = (num: number) => num.toString().padStart(2, '0');
        dueDateValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }

      setFormData({
        type: activity.type,
        subject: activity.subject,
        description: activity.description || '',
        status: activity.status,
        dueDate: dueDateValue,
        accountId: activity.accountId || '',
        dealId: activity.dealId || '',
        contactId: activity.contactId || '',
        assignedToId: activity.assignedToId || ''
      });
      setIsClientMode(!!(activity.accountId || activity.dealId || activity.contactId));
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      
      const pad = (num: number) => num.toString().padStart(2, '0');
      const tomorrowValue = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
      
      setFormData({
        type: initialType,
        subject: '',
        description: '',
        status: 'PENDING',
        dueDate: tomorrowValue,
        accountId: preselectedContact?.companyId || '',
        dealId: '',
        contactId: preselectedContact?.id || '',
        assignedToId: '',
        participantIds: []
      });
      setIsClientMode(!!preselectedContact);
    }
  }, [activity, preselectedContact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        status: (markAsCompleted ? 'COMPLETED' : 'PENDING') as 'PENDING' | 'COMPLETED' // Auto-inject status with explicit typing
      };
      
      if (activity) {
        await updateActivity(activity.id, payload);
      } else {
        await createActivity(payload);
      }
      onSave();
    } catch (error) {
      console.error('Error saving activity:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isMeeting = formData.type === 'MEETING';
  
  // Activity type icons
  const typeIcons: Record<string, React.ReactNode> = {
    NOTE: <FileText className="w-4 h-4" />,
    CALL: <Phone className="w-4 h-4" />,
    EMAIL: <Mail className="w-4 h-4" />,
    MEETING: <Calendar className="w-4 h-4" />,
    TASK: <CheckSquare className="w-4 h-4" />
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-reply-border-dark transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-reply-border-dark bg-gradient-to-r from-orange-600 to-red-600 dark:from-orange-800 dark:to-red-800">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <ClipboardList className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {activity ? 'Editar Actividad' : 'Nueva Actividad'}
                </h2>
                <p className="text-white/80 text-sm">{isMeeting && '📅 Se sincronizará con Google Calendar'}</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Locked Contact Card */}
          {preselectedContact ? (
            <div className="p-4 bg-reply-bg dark:bg-white/5 border border-gray-200 dark:border-reply-border-dark rounded-xl">
              <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {preselectedContact.isCompany ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                Vinculado a {preselectedContact.isCompany ? 'Empresa' : 'Cliente'}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold">
                  {preselectedContact.name.substring(0,2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{preselectedContact.name}</h4>
                  {preselectedContact.email && <p className="text-xs text-gray-500 dark:text-gray-400">{preselectedContact.email}</p>}
                </div>
              </div>
              {!preselectedContact.email && isMeeting && (
                <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-2.5 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>Este contacto no tiene email. Agrega uno para enviar la invitación de calendario.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl">
              <button
                type="button"
                onClick={() => {
                    setIsClientMode(false);
                    setFormData({...formData, accountId: '', dealId: '', contactId: ''});
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  !isClientMode 
                    ? 'bg-white dark:bg-gray-600 text-orange-600 shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <User className="w-4 h-4" />
                Interna / Personal
              </button>
              <button
                type="button"
                onClick={() => setIsClientMode(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isClientMode 
                    ? 'bg-white dark:bg-gray-600 text-orange-600 shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Cliente / Negocio
              </button>
            </div>
          )}

          {/* Type of Activity */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">Tipo de Actividad</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-4 py-3 min-h-[44px] rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent font-medium transition-all leading-normal"
            >
              <option value="NOTE">📝 Nota</option>
              <option value="CALL">📞 Llamada</option>
              <option value="EMAIL">📧 Email</option>
              <option value="MEETING">📅 Reunión (Google Calendar)</option>
              <option value="TASK">✅ Tarea</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              Asunto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-4 py-3 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-400 transition-all"
              placeholder={isMeeting ? "Ej. Reunión con cliente - Demo del producto" : "Ej. Llamar al cliente sobre propuesta"}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-400 transition-all resize-none"
              rows={3}
              placeholder="Detalles adicionales, agenda, notas..."
            />
          </div>

          {/* Date & Time with Icon */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              {isMeeting ? 'Fecha y Hora de la Reunión' : 'Fecha y Hora de Vencimiento'}
            </label>
            <input
              type="datetime-local"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-4 py-3 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
            {isMeeting && formData.dueDate && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Info className="w-4 h-4" />
                Esta reunión se sincronizará automáticamente con Google Calendar
              </p>
            )}
          </div>

          {/* Assigned To & Participants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                <User className="w-4 h-4" />
                {isMeeting ? 'Organizador' : 'Responsable'}
              </label>
              <select
                value={formData.assignedToId}
                onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                disabled={!activity}
                className={`w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent font-medium transition-all ${!activity ? 'opacity-70 cursor-not-allowed bg-gray-100 dark:bg-gray-900' : ''}`}
              >
                <option value="">Sin asignar</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                ))}
              </select>
            </div>
            
            {isMeeting && (
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Invitados
                </label>
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-2 max-h-32 overflow-y-auto bg-white dark:bg-gray-800">
                   {users.filter(u => u.id !== formData.assignedToId && !u.name.toLowerCase().includes('admin')).map(user => (
                      <label key={user.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                        <input 
                           type="checkbox"
                           checked={formData.participantIds?.includes(user.id)}
                           onChange={(e) => {
                             const current = formData.participantIds || [];
                             if (e.target.checked) setFormData({...formData, participantIds: [...current, user.id]});
                             else setFormData({...formData, participantIds: current.filter(id => id !== user.id)});
                           }}
                           className="rounded text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{user.name}</span>
                      </label>
                   ))}
                   {users.filter(u => u.id !== formData.assignedToId && !u.name.toLowerCase().includes('admin')).length === 0 && <p className="text-xs text-gray-500 italic p-1">No hay más agentes disponibles</p>}
                </div>
              </div>
            )}
          </div>

          {/* Client Relationships */}
          {isClientMode && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-reply-border-dark animate-fadeIn">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Contacto
                </label>
                <select
                  value={formData.contactId || ''}
                  onChange={(e) => setFormData({ ...formData, contactId: e.target.value })}
                  disabled={!!preselectedContact} 
                  className={`w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all ${!!preselectedContact ? 'opacity-70 cursor-not-allowed bg-gray-100 dark:bg-gray-900' : ''}`}
                >
                  <option value="">Ninguno</option>
                  {contacts.map((contact: any) => (
                    <option key={contact.id} value={contact.id}>{contact.name} {contact.email ? `(${contact.email})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Empresa
                  </label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  >
                    <option value="">Ninguna</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    Oportunidad
                  </label>
                  <select
                    value={formData.dealId}
                    onChange={(e) => setFormData({ ...formData, dealId: e.target.value })}
                    className="w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  >
                    <option value="">Ninguno</option>
                    {deals.map(d => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Optional: Mark as Completed Checkbox */}
          {!activity && (
            <div className="pt-4 border-t border-gray-200 dark:border-reply-border-dark">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={markAsCompleted}
                  onChange={(e) => setMarkAsCompleted(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Marcar como ya completada (útil para registrar llamadas pasadas)
                </span>
              </label>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-gray-800/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 h-11 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 h-11 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {activity ? 'Guardar Cambios' : 'Crear Actividad'}
          </button>
        </div>
      </div>
    </div>
  );
};



