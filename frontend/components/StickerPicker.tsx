import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getMedia, Media } from '../services/mediaService';
import { BASE_URL } from '../services/apiConfig';

interface StickerPickerProps {
  onSelect: (sticker: Media) => void;
  onClose: () => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect, onClose }) => {
  const [stickers, setStickers] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStickers();
  }, []);

  const loadStickers = async () => {
    try {
      setLoading(true);
      // Fetch media with category 'STICKER'
      const data = await getMedia({ category: 'STICKER' });
      setStickers(data.media);
    } catch (error: any) {
      console.error(error);
      toast.error('Error al cargar stickers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-16 left-4 w-72 h-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
        <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
            <span className="text-lg">⭐</span> Stickers Guardados
        </h3>
        <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3 bg-white dark:bg-[#0b141a]">
        {loading ? (
           <div className="flex justify-center p-4">
               <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
           </div>
        ) : stickers.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4">
               <span className="text-3xl grayscale opacity-50 mb-2">😢</span>
               <p className="text-xs">No tienes stickers guardados.</p>
               <p className="text-[10px] opacity-70 mt-1">Dale click derecho o mantén presionado un sticker en el chat para guardarlo.</p>
           </div>
        ) : (
            <div className="grid grid-cols-3 gap-2">
                {stickers.map(sticker => (
                    <div 
                        key={sticker.id}
                        onClick={() => onSelect(sticker)}
                        className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center relative group"
                    >
                        <img 
                            src={sticker.url.startsWith('http') ? sticker.url : `${BASE_URL}${sticker.url}`} 
                            alt="Sticker" 
                            className="w-16 h-16 object-contain pointer-events-none"
                            loading="lazy"
                        />
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
