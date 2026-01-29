import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { sendEmail, SendEmailDTO } from '../services/emailService';
import { api } from '../src/lib/axios';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactEmail?: string;
  contactId?: string;
  ticketId?: string;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  contactEmail = '',
  contactId,
  ticketId,
}) => {
  const [to, setTo] = useState(contactEmail);
  const [from, setFrom] = useState('Cargando...');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);

  useEffect(() => {
      if (isOpen) {
          // 🔧 FIX: Use axios api instance
          api.get('/company/email-config')
            .then(res => {
              const data = res.data.data;
              if (data?.isConfigured && data?.senderEmail) {
                  // Email configurado correctamente
                  const senderName = data.senderName || 'Mi Empresa';
                  const senderEmail = data.senderEmail;
                  setFrom(`${senderName} <${senderEmail}>`);
                  setEmailConfigured(true);
              } else {
                  // Email NO configurado
                  setFrom('⚠️ Sin configurar');
                  setEmailConfigured(false);
              }
            })
            .catch(err => {
                console.error('Error fetching email config:', err);
                setFrom('⚠️ Error al cargar');
                setEmailConfigured(false);
            });
      }
  }, [isOpen]);

  const handleSend = async () => {
    if (!emailConfigured) {
      toast.error('Debes configurar tu correo corporativo primero');
      return;
    }

    if (!to || !subject || !body) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setIsSending(true);
    try {
      const emailData: SendEmailDTO = {
        to: [to],
        subject,
        bodyHtml: `<p>${body.replace(/\n/g, '<br>')}</p>`,
        bodyText: body,
        contactId,
        ticketId,
        enableTracking: true,
      };

      await sendEmail(emailData);
      toast.success('Email enviado correctamente');
      onClose();
      
      // Reset form
      setTo('');
      setSubject('');
      setBody('');
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error.message || 'Error al enviar el email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#202c33] rounded-lg shadow-2xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            📧 Enviar Email
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Email Not Configured Warning */}
          {!emailConfigured && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Correo corporativo no configurado
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <p>Para enviar emails, primero debes configurar tu correo corporativo.</p>
                    <a href="/settings" className="font-medium underline hover:text-yellow-600 mt-1 inline-block">
                      Ir a Configuración → Email
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* From Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              De:
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                type="text"
                value={from}
                disabled
                className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-[#2a3942] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 cursor-not-allowed"
              />
            </div>
          </div>

          {/* To Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Para:
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@ejemplo.com"
              className="w-full px-4 py-3 bg-white dark:bg-[#2a3942] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Asunto:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del email"
              className="w-full px-4 py-3 bg-white dark:bg-[#2a3942] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mensaje:
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Escribe tu mensaje aquí..."
              className="w-full px-4 py-3 bg-white dark:bg-[#2a3942] border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !emailConfigured}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isSending ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Enviando...
              </>
            ) : (
              <>
                📤 Enviar Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
