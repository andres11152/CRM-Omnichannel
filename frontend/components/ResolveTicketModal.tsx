import React, { useState } from 'react';
import { 
    X, 
    CheckCircle2, 
    LifeBuoy, 
    ShieldAlert, 
    Archive, 
    Ban, 
    Briefcase,
    DollarSign
} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onResolve: (category: string, reason: string) => void;
    isResolving?: boolean;
}

export const ResolveTicketModal: React.FC<Props> = ({ isOpen, onClose, onResolve, isResolving = false }) => {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [note, setNote] = useState('');

    if (!isOpen) return null;

    const categories = [
        { 
            id: 'SALE', 
            label: 'Venta Cerrada', 
            description: 'Transacción completada exitosamente',
            icon: DollarSign, 
            colorClass: 'text-emerald-600 dark:text-emerald-400',
            bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
            borderClass: 'border-emerald-200 dark:border-emerald-800',
            hoverClass: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
        },
        { 
            id: 'SUPPORT', 
            label: 'Soporte Resuelto', 
            description: 'Incidencia técnica o duda solucionada',
            icon: LifeBuoy, 
            colorClass: 'text-blue-600 dark:text-blue-400',
            bgClass: 'bg-blue-50 dark:bg-blue-900/20',
            borderClass: 'border-blue-200 dark:border-blue-800',
            hoverClass: 'hover:bg-blue-100 dark:hover:bg-blue-900/40'
        },
        { 
            id: 'ADMIN', 
            label: 'Administrativo', 
            description: 'Gestión interna o procesos',
            icon: Briefcase, 
            colorClass: 'text-purple-600 dark:text-purple-400',
            bgClass: 'bg-purple-50 dark:bg-purple-900/20',
            borderClass: 'border-purple-200 dark:border-purple-800',
            hoverClass: 'hover:bg-purple-100 dark:hover:bg-purple-900/40'
        },
        { 
            id: 'OTHER', 
            label: 'Otro / Archivo', 
            description: 'Consulta general sin categoría específica',
            icon: Archive, 
            colorClass: 'text-gray-600 dark:text-gray-400',
            bgClass: 'bg-gray-50 dark:bg-gray-800',
            borderClass: 'border-gray-200 dark:border-gray-700',
            hoverClass: 'hover:bg-gray-100 dark:hover:bg-gray-700'
        }
    ];

    const handleSubmit = () => {
        if (selectedCategory) {
            onResolve(selectedCategory, note);
        }
    };

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-[#1f2937]">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Finalizar Conversación
                        </h2>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Selecciona el resultado final para clasificar este ticket y archivarlo correctamente.
                    </p>

                    <div className="grid grid-cols-1 gap-3 mb-6">
                        {categories.map((cat) => {
                            const Icon = cat.icon;
                            const isSelected = selectedCategory === cat.id;
                            
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    disabled={isResolving}
                                    className={`relative group flex items-start gap-4 p-4 rounded-xl border transition-all text-left w-full
                                        ${isSelected 
                                            ? `ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#1f2937] ${cat.borderClass} ${cat.bgClass}`
                                            : `border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800`
                                        }
                                    `}
                                >
                                    <div className={`p-2 rounded-lg ${cat.bgClass} ${cat.colorClass} group-hover:scale-110 transition-transform`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className={`font-bold text-sm mb-0.5 ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                                            {cat.label}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                                            {cat.description}
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-4 right-4">
                                            <span className={`block w-2.5 h-2.5 rounded-full ${cat.colorClass.replace('text-', 'bg-')}`}></span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {selectedCategory && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200 mb-4">
                             <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                Nota de Cierre (Opcional)
                             </label>
                             <textarea 
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Añade detalles adicionales sobre la resolución..."
                                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-none"
                             />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                         <button 
                            onClick={() => onResolve('SPAM', 'Ticket marcado como Spam')}
                            className="flex-1 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <Ban className="w-4 h-4" />
                            <span>Spam</span>
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!selectedCategory || isResolving}
                            className={`flex-[2] px-4 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 text-white flex items-center justify-center gap-2 transition-all
                                ${!selectedCategory || isResolving 
                                    ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-500' 
                                    : 'bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98]'
                                }
                            `}
                        >
                            {isResolving ? 'Procesando...' : 'Confirmar Resolución'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
