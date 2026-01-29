import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Tag } from '../types';
import { api } from '../src/lib/axios'; // New Axios Instance
import { ModuleHeader } from './common/ModuleHeader';

export const TagsManager: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState({ name: '', color: 'bg-indigo-500 text-white' });
  const [search, setSearch] = useState('');

  // Expanded Professional Color Palette
  const colors = [
    { label: 'Indigo', value: 'bg-indigo-500 text-white' },
    { label: 'Blue', value: 'bg-blue-500 text-white' },
    { label: 'Sky', value: 'bg-sky-500 text-white' },
    { label: 'Teal', value: 'bg-teal-500 text-white' },
    { label: 'Emerald', value: 'bg-emerald-500 text-white' },
    { label: 'Green', value: 'bg-green-500 text-white' },
    { label: 'Yellow', value: 'bg-yellow-500 text-white' }, // Adjusted for contrast
    { label: 'Orange', value: 'bg-orange-500 text-white' },
    { label: 'Red', value: 'bg-red-500 text-white' },
    { label: 'Rose', value: 'bg-rose-500 text-white' },
    { label: 'Pink', value: 'bg-pink-500 text-white' },
    { label: 'Purple', value: 'bg-purple-500 text-white' },
    { label: 'Violet', value: 'bg-violet-500 text-white' },
    { label: 'Gray', value: 'bg-gray-500 text-white' },
  ];

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    setFilteredTags(
        tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, tags]);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tags');
      // Handle both direct array or wrapped response
      const tagsData = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setTags(tagsData);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar etiquetas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.name.trim()) return;

    if (tags.some(t => t.name.toLowerCase() === newTag.name.toLowerCase())) {
        toast.error('Ya existe una etiqueta con este nombre');
        return;
    }

    try {
      const res = await api.post('/tags', newTag);
      const createdTag = res.data.data || res.data; // Flexible unwrapping
      
      setTags(prev => [...prev, createdTag]);
      setNewTag({ ...newTag, name: '' }); 
      toast.success('Etiqueta creada correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al crear etiqueta');
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if(!window.confirm(`¿Eliminar la etiqueta "${name}"?`)) return;

    try {
      await api.delete(`/tags/${id}`);
      setTags(prev => prev.filter(t => t.id !== id));
      toast.success('Etiqueta eliminada');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar etiqueta');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#0b141a] overflow-hidden font-sans">
      <ModuleHeader
        title="Gestión de Etiquetas"
        description="Organiza tus clientes con un sistema de clasificación visual."
        icon={
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
        }
        gradient="from-pink-600 to-rose-600 dark:from-pink-700 dark:to-rose-800"
        stats={{ label: "Total Etiquetas", value: tags.length }}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* CREATION CARD */}
          <div className="bg-white dark:bg-[#1f2937] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md">
             <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center">
                 <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full text-indigo-600 dark:text-indigo-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </span>
                    Nueva Etiqueta
                 </h2>
             </div>
             
             <div className="p-6 md:p-8">
                <form onSubmit={handleCreateTag} className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre de la Etiqueta</label>
                           <div className="relative">
                               <input 
                                 type="text" 
                                 value={newTag.name}
                                 onChange={e => setNewTag({ ...newTag, name: e.target.value })}
                                 placeholder="Ej: Cliente Premium"
                                 className="w-full pl-4 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-white focus:border-indigo-500 focus:ring-0 outline-none transition-all font-medium text-lg placeholder:text-gray-400"
                               />
                               {newTag.name && (
                                   <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                       <span className={`px-2 py-1 rounded text-xs font-bold ${newTag.color}`}>Preview</span>
                                   </div>
                               )}
                           </div>
                        </div>

                        <div className="space-y-4">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Selecciona un Color</label>
                           <div className="flex flex-wrap gap-3">
                                {colors.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setNewTag({ ...newTag, color: c.value })}
                                        className={`w-10 h-10 rounded-full cursor-pointer transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md ${c.value} ${newTag.color === c.value ? 'ring-4 ring-offset-2 ring-indigo-500 dark:ring-offset-[#1f2937] scale-110' : 'hover:scale-110 opacity-80 hover:opacity-100'}`}
                                        title={c.label}
                                    >
                                        {newTag.color === c.value && (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        )}
                                    </button>
                                ))}
                           </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
                        <button 
                          type="submit" 
                          disabled={!newTag.name.trim()}
                          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                        >
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                           Crear Etiqueta
                        </button>
                    </div>
                </form>
             </div>
          </div>

          {/* LIST SECTION */}
          <div className="space-y-4">
             {/* Toolbar */}
             <div className="flex justify-between items-center px-2">
                 <h3 className="text-xl font-bold text-gray-800 dark:text-white">Lista de Etiquetas</h3>
                 <div className="relative w-64">
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#1f2937] rounded-xl border-none shadow-sm focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    />
                    <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                 </div>
             </div>

             {/* Grid */}
             {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[1,2,3].map(i => (
                        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"></div>
                    ))}
                </div>
             ) : filteredTags.length === 0 ? (
                 <div className="text-center py-12 bg-white dark:bg-[#1f2937] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                     <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                     </div>
                     <p className="text-gray-500 dark:text-gray-400 font-medium">{search ? 'No se encontraron etiquetas' : 'No hay etiquetas creadas aún'}</p>
                 </div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTags.map(tag => (
                        <div key={tag.id} className="group bg-white dark:bg-[#1f2937] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-900 transition-all flex justify-between items-center relative overflow-hidden">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tag.color} shadow-sm`}>
                                    <span className="text-lg font-bold">#</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-white">{tag.name}</h4>
                                    <p className="text-xs text-gray-400">{new Date(tag.createdAt || Date.now()).toLocaleDateString()}</p>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => handleDeleteTag(tag.id, tag.name)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all transform translate-x-2 group-hover:translate-x-0"
                                title="Eliminar Etiqueta"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
};
