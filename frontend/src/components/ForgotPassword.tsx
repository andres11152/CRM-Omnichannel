import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '@/services/apiConfig';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ text: 'Se ha enviado un correo con las instrucciones.', type: 'success' });
        setEmail('');
      } else {
        setMessage({ text: data.message || 'Error al procesar la solicitud.', type: 'error' });
      }
    } catch (error) {
       setMessage({ text: 'Error de conexión. Intente nuevamente.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-reply-bg dark:bg-reply-bg-dark font-sans transition-colors duration-300">
      {/* LEFT SIDE: BRANDING */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-reply-brand dark:bg-reply-brand-dark items-center justify-center">
         <div className="absolute inset-0 opacity-10 dark:opacity-20 bg-[radial-gradient(#ffffff33_1px,transparent_1px)] [background-size:16px_16px]"></div>
         <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
         <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

         <div className="z-10 text-center text-white px-12">
            <div className="mb-8 flex justify-center">
                 <svg viewBox="0 0 100 100" fill="none" className="w-32 h-32 drop-shadow-2xl">
                    <path d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z" className="fill-white" />
                    <path d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z" className="fill-green-200" />
                 </svg>
            </div>
            <h1 className="text-4xl font-bold mb-6 tracking-tight">Recuperación de Cuenta</h1>
            <p className="text-lg text-green-100 max-w-md mx-auto leading-relaxed">
              No te preocupes, te ayudaremos a recuperar el acceso a tu cuenta rápidamente.
            </p>
         </div>
      </div>

      {/* RIGHT SIDE: FORM */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 xl:px-24">
          <div className="max-w-md w-full mx-auto">
             <div className="mb-10 text-center lg:text-left">
                <Link to="/" className="text-reply-green dark:text-reply-green-dark hover:underline text-sm font-semibold mb-6 inline-block">
                    &larr; Volver al inicio de sesión
                </Link>
                <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
                   ¿Olvidaste tu contraseña?
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                   Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
                </p>
             </div>

             <form onSubmit={handleSubmit} className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Correo Electrónico</label>
                    <input 
                      type="email" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-panel-dark text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-reply-green focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="nombre@empresa.com"
                    />
                 </div>
                 
                 {message && (
                   <div className={`p-4 rounded-xl text-sm text-center font-medium ${message.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'}`}>
                     {message.text}
                   </div>
                 )}

                 <button 
                   type="submit" 
                   disabled={isLoading}
                   className="w-full py-3.5 px-4 bg-reply-green hover:bg-green-600 dark:bg-reply-green-dark dark:hover:bg-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                 >
                    {isLoading && <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {isLoading ? 'Enviando Link...' : 'Enviar Link de Recuperación'}
                 </button>
             </form>
          </div>
      </div>
    </div>
  );
};


