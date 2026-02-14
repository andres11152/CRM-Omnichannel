import React from 'react';
import { DB_SCHEMA } from '../constants';

export const SchemaVisualizer: React.FC = () => {
  return (
    <div className="p-6 bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
        <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        Arquitectura de Base de Datos
      </h2>
      <p className="text-gray-600 dark:text-gray-300 mb-8">
        Esquema Entidad-Relación optimizado para mensajería de alto rendimiento y contexto de IA híbrida.
        <span className="block text-sm text-indigo-500 dark:text-indigo-400 mt-1">Esta arquitectura soporta PostgreSQL 15+ y utiliza JSONB para metadatos flexibles.</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DB_SCHEMA.map((table) => (
          <div key={table.tableName} className="border border-gray-200 dark:border-reply-border-dark rounded-lg overflow-hidden bg-reply-bg dark:bg-reply-surface-dark flex flex-col transition-colors duration-200">
            <div className="bg-gray-100 dark:bg-reply-border-dark px-4 py-3 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center">
              <h3 className="font-bold text-gray-800 dark:text-white font-mono">{table.tableName}</h3>
              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full">Tabla</span>
            </div>
            <div className="p-4 flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 italic">{table.description}</p>
              <ul className="space-y-2">
                {table.columns.map((col) => (
                  <li key={col.name} className="flex justify-between items-start text-sm border-b border-gray-200 dark:border-reply-border-dark last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2">
                      {col.isPK && <span className="text-xxs font-bold text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-500 px-1 rounded">PK</span>}
                      {col.isFK && <span className="text-xxs font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 px-1 rounded">FK</span>}
                      <span className="font-medium text-gray-700 dark:text-gray-200">{col.name}</span>
                    </div>
                    <span className="text-gray-400 font-mono text-xs">{col.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-md border border-indigo-100 dark:border-indigo-800/50">
        <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2">Notas de Arquitectura:</h4>
        <ul className="list-disc list-inside text-sm text-indigo-800 dark:text-indigo-400 space-y-1">
          <li><strong>Implementación Redis:</strong> Usado para gestión de `Colas` (BullMQ) y caché de `Prompts` para reducir consultas a BD.</li>
          <li><strong>Tabla Integrations:</strong> Almacena de forma segura claves API encriptadas. El backend las desencripta en tiempo de ejecución.</li>
          <li><strong>IA Híbrida:</strong> El sistema consulta `integrations` para decidir si instanciar `GoogleGenAI` o `OpenAI`.</li>
        </ul>
      </div>
    </div>
  );
};

