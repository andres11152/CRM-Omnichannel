import React, { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    phone: string,
    name: string,
    message: string,
    addToContacts: boolean,
  ) => void;
}

export const NewChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [addToContacts, setAddToContacts] = useState(true); // Default true for convenience

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Clean Phone
    const cleanPhone = phone.replace(/\D/g, "");

    // 2. Validate
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      setError("El número debe tener entre 7 y 15 dígitos.");
      return;
    }

    if (!phone) return;

    // 3. Submit Cleaned Phone (or keep original if preferred, but usually clean is better)
    // We send original to let backend decide format if needed, but validation ensures strictly numbers exist.
    onSubmit(cleanPhone, name, message, addToContacts);

    setPhone("");
    setName("");
    setMessage("");
    setAddToContacts(true);
    setError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Iniciar Nuevo Chat"
      icon={<MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />}
      size="md"
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            Cancelar
          </ModalButton>
          <ModalButton variant="primary" type="submit" form="new-chat-form">
            <Send className="w-4 h-4" />
            Iniciar Chat
          </ModalButton>
        </>
      }
    >
        <form id="new-chat-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Número de Teléfono <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ej: 573001234567"
              className={`w-full px-4 py-2 rounded-lg border ${error ? "border-red-500" : "border-gray-300 dark:border-gray-600"} bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all`}
              required
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mt-1 font-bold">{error}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Incluye el código de país sin el símbolo +
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre (Opcional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mensaje Inicial (Opcional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe un mensaje de saludo..."
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent h-24 resize-none outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="addToContacts"
              checked={addToContacts}
              onChange={(e) => setAddToContacts(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-gray-600 dark:bg-reply-surface-dark"
            />
            <label
              htmlFor="addToContacts"
              className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
            >
              Guardar en Contactos (CRM)
            </label>
          </div>

        </form>
    </Modal>
  );
};
