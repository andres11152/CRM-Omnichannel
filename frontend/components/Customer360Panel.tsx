import React, { useState } from 'react';
import { 
    User, 
    Mail, 
    Phone, 
    ShieldCheck, 
    Copy, 
    Check, 
    Edit3, 
    Zap, 
    ClipboardCheck, 
    Calendar, 
    ChevronRight,
    Building2,
    Info,
    Clock
} from 'lucide-react';
import { Contact } from '../types';
import { InternalNotes } from './InternalNotes';
import { toast } from 'sonner';

interface Customer360PanelProps {
  contact: Contact;
  onEditContact: () => void;
  onCreateTask?: () => void;
  onScheduleMeeting?: () => void;
}

export const Customer360Panel: React.FC<Customer360PanelProps> = ({
  contact,
  onEditContact,
  onCreateTask,
  onScheduleMeeting
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copiado`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="w-full md:w-96 bg-white dark:bg-[#111b21] border-l border-gray-100 dark:border-gray-800 flex flex-col h-full shadow-2xl relative z-0">
      
      {/* Dynamic Header with Status Indicator */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111b21] flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          Customer 360°
        </h3>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Live</span>
        </div>
      </div>

      {/* Main Container with subtle scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-gray-50/30 dark:bg-[#111b21]">
        
        {/* Profile Card Section */}
        <div className="p-6 text-center border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111b21]">
          <div className="relative inline-block group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full opacity-30 group-hover:opacity-60 transition duration-500 blur"></div>
            <img
              src={contact.profilePicUrl || contact.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`}
              alt={contact.name}
              className="relative w-24 h-24 rounded-full mx-auto border-2 border-white dark:border-gray-900 shadow-xl object-cover transform transition-transform group-hover:scale-[1.02]"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=random`;
              }}
            />
            <div className="absolute bottom-1 right-1 w-6 h-6 bg-white dark:bg-[#1f2937] p-1 rounded-full shadow-lg flex items-center justify-center border border-gray-100 dark:border-gray-700">
                <div className="w-full h-full bg-emerald-500 rounded-full"></div>
            </div>
          </div>
          
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-1">
            {contact.name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            Última actividad hoy 14:30
          </p>
        </div>

        {/* Contact Details Grid */}
        <div className="p-4 space-y-4">
          
          {/* Card: Essential Info */}
          <div className="bg-white dark:bg-[#1e272e] rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1 text-gray-400">
                <Info className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Detalles de Contacto</span>
            </div>
            
            {/* Email Field */}
            {contact.email && (
              <div className="group flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Email</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{contact.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(contact.email!, 'Email')}
                  className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                >
                  {copiedField === 'Email' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}

            {/* Phone Field */}
            {contact.phone && (
              <div className="group flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">WhatsApp</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-mono">{contact.phone}</p>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(contact.phone!, 'Teléfono')}
                  className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
                >
                  {copiedField === 'Teléfono' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}

            <button
              onClick={onEditContact}
              className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-xs font-bold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar Información
            </button>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white dark:bg-[#1e272e] rounded-xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
             <div className="flex items-center gap-2 mb-1 text-gray-400">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Acciones Rápidas</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={onCreateTask}
                  className="group flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-indigo-100 dark:hover:border-indigo-900/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <ClipboardCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">Nueva Tarea</p>
                        <p className="text-[10px] text-gray-400">Asignar seguimiento</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={onScheduleMeeting}
                  className="group flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-emerald-100 dark:hover:border-emerald-900/30 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">Schedule Meeting</p>
                        <p className="text-[10px] text-gray-400">Programar llamada</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
          </div>

          {/* Internal Notes Container */}
          <div className="mt-4">
             <div className="flex items-center gap-2 mb-3 text-gray-400">
                <Building2 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Bitácora Interna</span>
            </div>
            <InternalNotes
                contactId={contact.realContactId || contact.id}
                contactName={contact.name}
                contactPhone={contact.phone}
                contact={contact}
                onEditContact={onEditContact}
                className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
