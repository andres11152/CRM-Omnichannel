import React, { useEffect } from 'react';

interface Props {
  message: string;
  type?: 'success' | 'info' | 'warning';
  onClose: () => void;
}

export const ToastNotification: React.FC<Props> = ({ message, type = 'info', onClose }) => {
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000); // Auto dismiss after 4 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 
                  type === 'warning' ? 'bg-yellow-50 border-yellow-200' : 
                  'bg-indigo-50 border-indigo-200';
                  
  const iconColor = type === 'success' ? 'text-green-500' : 
                    type === 'warning' ? 'text-yellow-500' : 
                    'text-indigo-500';

  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 border border-r-0 border-t-0 border-b-0 max-w-sm animate-bounce-in ${bgColor} ${type === 'success' ? 'border-l-green-500' : 'border-l-indigo-500'}`}>
      <div className={`${iconColor}`}>
        {type === 'success' ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )}
      </div>
      <div>
        <h4 className={`font-bold text-sm ${type === 'success' ? 'text-green-800' : 'text-indigo-800'}`}>
          {type === 'success' ? '¡Nuevo Ticket Asignado!' : 'Notificación'}
        </h4>
        <p className="text-xs text-gray-600 mt-0.5">{message}</p>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
};