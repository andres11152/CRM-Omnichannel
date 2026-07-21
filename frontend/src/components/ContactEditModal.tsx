import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPen } from 'lucide-react';
import { Contact } from '@/types';
import { API_BASE_URL } from '@/services/apiConfig';
import { toast } from 'sonner';
import { Modal, ModalButton } from '@/components/ui/Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  onSuccess: (updatedContact: Contact) => void;
}

export const ContactEditModal: React.FC<Props> = ({ isOpen, onClose, contact, onSuccess }) => {
  const { t } = useTranslation();
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
      console.info('[ContactEditModal] Opening with contact:', contact);
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
      toast.success(t('contact_edit_modal.toast.updated', 'Contacto actualizado'));
      onSuccess(data); // Provide updated contact back to parent
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(t('contact_edit_modal.toast.update_error', 'Error al actualizar contacto'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Contacto"
      icon={<UserPen className="w-5 h-5" />}
      size="md"
      busy={loading}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </ModalButton>
          <ModalButton variant="primary" type="submit" form="contact-edit-form" loading={loading} className="flex-1">
            Guardar Cambios
          </ModalButton>
        </>
      }
    >
        <form id="contact-edit-form" onSubmit={handleSubmit} className="space-y-5">
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

        </form>
    </Modal>
  );
};


