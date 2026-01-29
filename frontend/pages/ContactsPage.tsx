import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Contact } from '../types';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ContactTimelineView } from '../components/crm/ContactTimelineView';
import { EmailModal } from '../components/EmailModal';
import { API_BASE_URL } from '../services/apiConfig';

export const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineContactId, setTimelineContactId] = useState<string | null>(null);
  
  // Email State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedEmailContact, setSelectedEmailContact] = useState<Contact | null>(null);
  
  // Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    fetchContacts();
  }, []);



  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('[ContactsPage] Contacts data:', data);
      if (data.status === 'success' && data.data?.contacts) {
        setContacts(data.data.contacts);
      } else if (Array.isArray(data)) {
        setContacts(data);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact);
      
      // Cleanup Logic
      const isFakeEmail = contact.email?.includes('@whatsapp.user') || contact.email?.includes('@c.us');
      const cleanEmail = isFakeEmail ? '' : (contact.email || '');
      
      let displayPhone = contact.phone || '';
      if (!displayPhone && isFakeEmail) {
         // Extract phone from tech email if phone field is empty
         displayPhone = contact.email?.split('@')[0] || '';
      }

      setNewName(contact.name === "Unknown Contact" || contact.name === displayPhone ? '' : contact.name);
      setNewEmail(cleanEmail);
      setNewPhone(displayPhone);
      setNewTags(contact.tags?.join(', ') || '');
      setNewNotes(contact.notes || '');
    } else {
      setEditingContact(null);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewTags('');
      setNewNotes('');
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
      
      // Use Unified Upsert Endpoint (Smart Logic) for both Create and Update
      // This ensures backend cleanup logic runs universally
      const url = `${API_BASE_URL}/contacts`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: editingContact?.id, // Critical: Pass ID to force update on correct record
          name: newName,
          email: newEmail,
          phone: newPhone,
          tags: tagsArray,
          notes: newNotes
        })
      });

      if (res.ok) {
        toast.success(editingContact ? 'Contacto actualizado' : 'Contacto creado correctamente');
        setShowModal(false);
        fetchContacts();
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || 'Error al guardar contacto';
        console.error('❌ Error saving contact:', errorData);
        toast.error(errorMessage);
      }
    } catch (error: any) {
      console.error('❌ Error saving contact (catch):', error);
      toast.error('Error de conexión al guardar contacto');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    console.log('🛑 [DELETE REQUEST START]');
    console.log('ID:', id);
    console.log('Name:', name);
    console.log('API_BASE_URL:', API_BASE_URL);

    // Temp: Bypass confirm to test event firing
    // if (!confirm(`¿Estás seguro de eliminar a ${name}?`)) return;
    
    const toastId = toast.loading(`Eliminando a ${name}...`);
    
    try {
      const token = localStorage.getItem('token');
      const url = `${API_BASE_URL}/contacts/${id}`;
      console.log('Fetching URL:', url);

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', res.status);
      
      if (!res.ok) {
        const errText = await res.text();
        console.error('Delete failed details:', errText);
        throw new Error(`Failed to delete: ${res.status}`);
      }
      
      await fetchContacts();
      toast.success('Contacto eliminado correctamente', { id: toastId });
    } catch (error) {
      console.error('❌ Error deleting contact:', error);
      toast.error('No se pudo eliminar el contacto', { id: toastId });
    }
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  console.log('[ContactsPage] Total contacts:', contacts.length);
  console.log('[ContactsPage] Filtered contacts:', filteredContacts.length);
  console.log('[ContactsPage] Search term:', searchTerm);
  console.log('[ContactsPage] First contact:', contacts[0]);
  console.log('[ContactsPage] Loading:', loading);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#111b21]">


      <ModuleHeader
        title="Contactos"
        description="Gestiona tu base de datos de clientes"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
        gradient="from-cyan-600 to-sky-600 dark:from-cyan-800 dark:to-sky-800"
        stats={{
          label: "Total Contactos",
          value: contacts.length
        }}
        action={
          <button
            onClick={() => handleOpenModal()}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Contacto
          </button>
        }
      />

      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="bg-white dark:bg-[#202c33] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              type="text" 
              placeholder="Buscar por nombre, email o teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#2a3942] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-[#2a3942] text-gray-600 dark:text-gray-300 text-xs uppercase font-semibold sticky top-0">
              <tr>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Nombre</th>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Email</th>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Teléfono</th>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Notas</th>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Etiquetas</th>
                <th className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">Cargando...</td></tr>
              ) : filteredContacts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">No se encontraron contactos.</td></tr>
              ) : (
                filteredContacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-700 dark:text-green-300 font-bold mr-3">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{contact.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {contact.email && !contact.email.includes('@') ? '-' : 
                       (contact.email?.includes('whatsapp.user') || contact.email?.includes('c.us') ? '-' : contact.email)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {contact.phone || (contact.email?.includes('whatsapp.user') ? contact.email.split('@')[0] : '-')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={contact.notes}>
                      {contact.notes || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags?.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => {
                          setTimelineContactId(contact.id);
                          setShowTimeline(true);
                        }} 
                        className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 mr-3"
                      >
                        📋 Timeline
                      </button>
                      
                      <button 
                        onClick={() => {
                          setSelectedEmailContact(contact);
                          setShowEmailModal(true);
                        }}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mr-3"
                        title="Enviar Email"
                      >
                        📧
                      </button>

                      <button onClick={() => handleOpenModal(contact)} className="text-indigo-600 hover:text-indigo-900 dark:hover:text-indigo-400 mr-3">Editar</button>
                      <button onClick={() => handleDelete(contact.id, contact.name)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">Eliminar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#202c33] rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">
              {editingContact ? 'Editar Contacto' : 'Nuevo Contacto'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                  <input 
                    required
                    type="text" 
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input 
                    type="email" 
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                  <input 
                    type="tel" 
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Etiquetas (separadas por coma)</label>
                  <input 
                    type="text" 
                    value={newTags}
                    onChange={e => setNewTags(e.target.value)}
                    placeholder="vip, lead, soporte"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                  <textarea 
                    rows={3}
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Información adicional sobre el contacto..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {showTimeline && timelineContactId && (
        <ContactTimelineView
          contactId={timelineContactId}
          onClose={() => {
            setShowTimeline(false);
            setTimelineContactId(null);
          }}
        />
      )}

      {/* Email Modal */}
      {showEmailModal && selectedEmailContact && (
        <EmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            setSelectedEmailContact(null);
          }}
          contactEmail={selectedEmailContact.email || ''}
          contactId={selectedEmailContact.id} // Note: Ideally use realContactId if available
        />
      )}
    </div>
  );
};
