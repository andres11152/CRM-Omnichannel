import React, { useState, useEffect } from "react";
import { Contact, Tag } from "@/types";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { API_BASE_URL } from "@/services/apiConfig";
import { toast } from "sonner";

interface TagsNavbarProps {
  contact: Contact;
  onContactUpdate?: (contact: Contact) => void;
}

export const TagsNavbar: React.FC<TagsNavbarProps> = ({
  contact,
  onContactUpdate,
}) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/tags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setAllTags(data);
          else if (data && Array.isArray(data.data)) setAllTags(data.data);
        }
      } catch (e: unknown) {
        console.error("Error loading tags in TagsNavbar", e);
      }
    };
    fetchTags();
  }, []);

  const handleToggleTag = async (tagId: string) => {
    const currentTags = contact.tags || [];
    const isAssigned = currentTags.includes(tagId);
    const newTags = isAssigned
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId];

    // Optimistic Update
    if (onContactUpdate) {
      onContactUpdate({ ...contact, tags: newTags });
    }

    try {
      const token = localStorage.getItem("token");
      const targetId = contact.realContactId || contact.id;
      const res = await fetch(`${API_BASE_URL}/contacts/${targetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tags: newTags }),
      });

      if (!res.ok) throw new Error("Failed to update tags");
      if (!isAssigned) setSearch(""); // Clear search to allow finding more tags
      // Removed setIsAdding(false) to allow multiple tag additions
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar etiqueta");
      if (onContactUpdate) {
        onContactUpdate({ ...contact, tags: currentTags });
      }
    }
  };

  const filteredAvailableTags = allTags.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) &&
      !(contact.tags || []).includes(t.id)
  );

  return (
    <div className="w-full bg-white/50 dark:bg-[#0b141a]/50 backdrop-blur-sm border-b border-gray-100 dark:border-white/5 px-2 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0 z-20">
      {/* Label/Icon */}
      <div className="flex items-center gap-1.5 px-2 text-gray-400 shrink-0 border-r border-gray-200 dark:border-white/10 mr-1">
        <TagIcon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Etiquetas</span>
      </div>

      {/* Active Tags */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {contact.tags?.map((tagId) => {
          const tagInfo = allTags.find((t) => t.id === tagId);
          if (!tagInfo) return null;
          return (
            <div
              key={tagId}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm border border-black/5 dark:border-white/5 transition-all hover:scale-105 shrink-0 ${tagInfo.color}`}
            >
              <span className="truncate max-w-[100px]">{tagInfo.name}</span>
              <button
                onClick={() => handleToggleTag(tagId)}
                className="hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}

        {/* Add Tag Button / Search */}
        {isAdding ? (
          <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200 min-w-0 flex-1">
            {/* Ultra-Compact Search Bar */}
            <div className="relative flex items-center w-32 sm:w-40 shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="Filtrar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-1 focus:ring-indigo-500 w-full outline-none transition-all pr-6"
              />
              {search && (
                <button 
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {/* Available Tags Horizontal Carousel (Optimized) */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 flex-1 no-scrollbar">
              {filteredAvailableTags.length > 0 ? (
                filteredAvailableTags.slice(0, 15).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleToggleTag(t.id)}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-bold border border-transparent hover:border-indigo-500/50 transition-all shrink-0 shadow-sm active:scale-95 whitespace-nowrap ${t.color || 'bg-gray-100 text-gray-700'}`}
                  >
                    + {t.name}
                  </button>
                ))
              ) : search ? (
                <span className="text-[9px] text-gray-400 px-2 italic shrink-0">Sin coincidencias</span>
              ) : (
                <span className="text-[9px] text-gray-400 px-2 italic shrink-0">Todo asignado</span>
              )}
            </div>

            <button 
              onClick={() => {
                setIsAdding(false);
                setSearch("");
              }} 
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all shrink-0 active:scale-95"
            >
              Listo
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-white/10 text-gray-400 hover:text-indigo-600 hover:border-indigo-600 transition-all text-[10px] font-bold shrink-0 bg-white dark:bg-transparent shadow-sm hover:shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir etiqueta</span>
          </button>
        )}
      </div>

      {(!contact.tags || contact.tags.length === 0) && !isAdding && (
        <span className="text-[10px] text-gray-400 italic px-2">Sin etiquetas</span>
      )}
    </div>
  );
};
