import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Contact } from '@/types';
import { API_BASE_URL } from '@/services/apiConfig';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  onSuccess: (updatedContact: Contact) => void;
}

export const ContactEditModal: React.FC<Props> = ({ isOpen, onClose, contact, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    tags: [] as string[]
  });
  const [loading, setLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);

  useEffect(() => {
    if (isOpen) {
      console.log('️ [ContactEditModal] Opening with contact:', contact);
      // 1. Hide internal tech emails from the user
      const isFakeEmail = contact.email?.includes('@whatsapp.user') || contact.email?.includes('@c.us');
      const cleanEmail = isFakeEmail ? '' : (contact.email || '');

      // 2. Extract phone from email if phone is missing (common in WhatsApp users)
      // 2. Extract phone: TRUTH FIRST Logic (No Censorship)
      // Prioritize explicit DB phone, fall back to Channel ID (Chat ID)
      const rawPhone = contact.phone;
      let channelPhone = contact.channelId ? contact.channelId.replace('@s.whatsapp.net', '') : '';
      channelPhone = channelPhone.replace(/:.*/, ''); // Remove device suffix if present
      
      // If DB phone exists, show it. Otherwise check if channelId is numeric.
      // We accept channelId even if it looks like a LID, to show the raw truth.
      const finalPhone = rawPhone || (channelPhone.match(/^\d+$/) ? channelPhone : '');

      setFormData({
        name: (contact.name === "Unknown Contact" || contact.name === "Unknown") ? '' : (contact.name || ''),
        phone: finalPhone,
        email: cleanEmail,
        notes: contact.notes || '',
        tags: contact.tags || []
      });
      loadTags();
    }
  }, [isOpen, contact]);

  // Load tags for the selector
  const loadTags = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/tags`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setAvailableTags(data);
      }
    } catch (e) {
      console.error("Error loading tags", e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleTagToggle = (tagId: string) => {
    setFormData(prev => ({
        ...prev,
        tags: prev.tags.includes(tagId) 
            ? prev.tags.filter(t => t !== tagId)
            : [...prev.tags, tagId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      // Use the upsert endpoint we created
      const res = await fetch(`${API_BASE_URL}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            ...formData,
            // Pass phone from contact if not editable or if strictly tied to channel
            phone: formData.phone || contact.phone 
        })
      });

      if (!res.ok) throw new Error('Failed to update contact');

      const data = await res.json();
      toast.success('Contacto actualizado');
      onSuccess(data); // Provide updated contact back to parent
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Error al actualizar contacto');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Hack: Detect dark mode from main app container since Portal escapes the React tree context
  // This ensures the modal matches the current theme even outside the main root div
  const isDark = document.querySelector('.dark') !== null;

  return createPortal(
    <div className={`${isDark ? 'dark' : ''} fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity`}>
      <div className="bg-white dark:bg-reply-panel-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-gray-100 dark:border-reply-border-dark">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-reply-border-dark flex justify-between items-center bg-reply-bg dark:bg-gray-800/50">
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 text-lg">
            <span className="text-xl">️</span> Editar Contacto
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto bg-white dark:bg-reply-panel-dark">
          {/* Avatar */}
          <div className="flex justify-center mb-2">
              <div className="w-20 h-20 rounded-full bg-reply-green/10 dark:bg-reply-green/20 flex items-center justify-center text-3xl text-reply-green dark:text-reply-green-light font-bold ring-4 ring-white dark:ring-gray-700 shadow-lg">
                  {formData.name?.charAt(0).toUpperCase() || <span className="text-2xl"></span>}
              </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre Completo</label>
            <input 
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-green focus:border-transparent outline-none transition-all placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Ej: Juan Pérez"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
                <input 
                type="text" 
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-green focus:border-transparent outline-none transition-all placeholder-gray-400 dark:placeholder-gray-500 font-mono text-sm"
                placeholder="+57 300..."
                />
                {/* DEBUG HELPER (REMOVE IN PROD) */}
                <small className="block mt-1 text-[10px] text-gray-400 font-mono">
                    DB: {contact.phone || 'null'} | CH: {contact.channelId || 'null'}
                </small>
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input 
                type="email" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-green focus:border-transparent outline-none transition-all placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="cliente@email.com"
                />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
            <textarea 
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-reply-green focus:border-transparent outline-none transition-all resize-none placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Notas importantes sobre el cliente..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Etiquetas</label>
            <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleTagToggle(tag.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                            formData.tags.includes(tag.id)
                                ? `${tag.color} ring-2 ring-offset-1 ring-gray-200 dark:ring-gray-700 border-transparent shadow-sm`
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        {tag.name}
                    </button>
                ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-reply-bg dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-reply-green hover:bg-reply-green-dark text-white font-medium shadow-lg shadow-reply-green/20 transition-all transform active:scale-[0.98] flex justify-center items-center gap-2"
            >
              {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Guardando...
                  </>
              ) : (
                  <>Guardar Cambios</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};


