import React, { useState } from "react";

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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-reply-panel-dark rounded-xl shadow-xl w-full max-w-md p-6 transform transition-all animate-in fade-in zoom-in duration-200">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <span className="bg-green-100 dark:bg-green-900 p-2 rounded-full text-green-600 dark:text-green-400">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </span>
          Iniciar Nuevo Chat
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-reply-border-dark">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition-colors flex items-center gap-2"
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              Iniciar Chat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
