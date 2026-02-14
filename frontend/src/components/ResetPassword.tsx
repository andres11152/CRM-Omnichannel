import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '@/services/apiConfig';

export const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage({ text: 'Las contraseñas no coinciden.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, passwordConfirm: confirmPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ text: 'Contraseña restablecida con éxito. Redirigiendo...', type: 'success' });
        // Optional: Save token if returned to auto-login?
        if (data.token) {
           localStorage.setItem('token', data.token);
           // Wait a sec then reload/redirect
           setTimeout(() => {
               window.location.href = '/'; // Force reload/nav to dashboard
           }, 1500);
        } else {
           setTimeout(() => navigate('/'), 2000);
        }
      } else {
        setMessage({ text: data.message || 'El enlace es inválido o ha expirado.', type: 'error' });
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
            <h1 className="text-4xl font-bold mb-6 tracking-tight">Crea tu nueva contraseña</h1>
            <p className="text-lg text-green-100 max-w-md mx-auto leading-relaxed">
              Asegúrate de elegir una contraseña segura que no hayas usado antes.
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
                   Restablecer Contraseña
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                   Ingresa tu nueva contraseña a continuación.
                </p>
             </div>

             <form onSubmit={handleSubmit} className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Nueva Contraseña</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-panel-dark text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-reply-green focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500 pr-12"
                        placeholder="••••••••"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                         {showPassword ? (
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                         ) : (
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                         )}
                      </button>
                    </div>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 ml-1">Confirmar Contraseña</label>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required 
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-reply-panel-dark text-gray-900 dark:text-white shadow-sm focus:ring-2 focus:ring-reply-green focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder="••••••••"
                    />
                 </div>
                 
                 {message && (
                   <div className={`p-4 rounded-xl text-sm text-center font-medium ${message.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 animate-shake'}`}>
                     {message.text}
                   </div>
                 )}

                 <button 
                   type="submit" 
                   disabled={isLoading}
                   className="w-full py-3.5 px-4 bg-reply-green hover:bg-green-600 dark:bg-reply-green-dark dark:hover:bg-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                 >
                    {isLoading && <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {isLoading ? 'Restableciendo...' : 'Guardar Nueva Contraseña'}
                 </button>
             </form>
          </div>
      </div>
    </div>
  );
};


