import React from 'react';
import { useTranslation } from "react-i18next";
import { DB_SCHEMA } from './admin/data/dbSchema';
import { StaggerContainer, fadeUpVariant, AnimatedCard } from "./ui/Motion";
import { motion } from "framer-motion";
import { ModuleHeader } from "./common/ModuleHeader";
import { Database, Table as TableIcon, Key, Link, Cpu } from "lucide-react";

export const SchemaVisualizer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full bg-reply-bg dark:bg-reply-bg-dark animate-in fade-in duration-500 overflow-hidden">
      <ModuleHeader
        title={t("schema.title", "Database Architecture")}
        description={t("schema.subtitle", "Esquema Entidad-Relación optimizado para mensajería de alto rendimiento y contextos de IA")}
        icon={<Database className="w-8 h-8 text-white" />}
        gradient="from-slate-800 via-slate-900 to-indigo-900 dark:from-black dark:via-slate-900 dark:to-indigo-950"
        stats={{
          label: t("schema.core_entities", "Core Entities"),
          value: DB_SCHEMA.length
        }}
      />

      <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-6">
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DB_SCHEMA.map((table) => (
            <motion.div key={table.tableName} variants={fadeUpVariant}>
              <AnimatedCard className="bg-white dark:bg-reply-panel-dark rounded-2xl border border-slate-200 dark:border-reply-border-dark shadow-sm overflow-hidden flex flex-col hover:border-indigo-500/30 transition-all group h-full">
                <div className="bg-slate-50 dark:bg-white/5 px-5 py-4 border-b border-slate-100 dark:border-reply-border-dark flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <TableIcon className="w-4 h-4 text-indigo-500" />
                     <h3 className="font-bold text-slate-800 dark:text-white font-mono">{table.tableName}</h3>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white dark:bg-reply-surface-dark px-2 py-0.5 rounded-full border border-slate-100 dark:border-white/5">{t("schema.relational", "Relational")}</span>
                </div>
                <div className="p-4 flex-1 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">{table.description}</p>
                  <div className="space-y-2">
                    {table.columns.map((col) => (
                      <div key={col.name} className="flex justify-between items-center py-2 border-b border-slate-50 dark:border-white/5 last:border-0 group/row">
                        <div className="flex items-center gap-2 min-w-0">
                          {col.isPK && <Key className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          {col.isFK && <Link className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{col.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-white/5 px-1.5 py-0.5 rounded">{col.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedCard>
            </motion.div>
          ))}
        </StaggerContainer>
        
        <div className="bg-white dark:bg-reply-panel-dark p-5 rounded-2xl border border-indigo-500/20 shadow-lg shadow-indigo-500/5 relative overflow-hidden">
           <div className="absolute right-0 top-0 opacity-5 p-4">
              <Cpu className="w-24 h-24" />
           </div>
           <div className="relative z-10">
              <h4 className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                <Database className="w-4 h-4" />
                {t("schema.technical_notes", "Notas Técnicas de Implementación")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <NoteBox 
                    title={t("schema.redis_title", "Implementación Redis")} 
                    text={t("schema.redis_text", "Usado para gestión de colas (BullMQ) y caché de prompts para reducir latencia en la IA.")} 
                 />
                 <NoteBox 
                    title={t("schema.integrations_title", "Integrations Layer")} 
                    text={t("schema.integrations_text", "Cifrado AES-256 para API Keys en BD. Desencriptación on-the-fly en servicios de infraestructura.")} 
                 />
                 <NoteBox 
                    title={t("schema.ai_hybrid_title", "Híbrido de IA")} 
                    text={t("schema.ai_hybrid_text", "Enrutamiento dinámico entre Google Gemini y OpenAI basado en costos y tokens disponibles.")} 
                 />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const NoteBox = ({ title, text }: { title: string; text: string }) => (
  <div className="space-y-1">
     <p className="text-sm font-bold text-slate-800 dark:text-white">{title}</p>
     <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
  </div>
);
