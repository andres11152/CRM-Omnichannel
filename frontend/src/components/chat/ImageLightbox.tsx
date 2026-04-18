import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from "lucide-react";
import { createPortal } from "react-dom";

export interface LightboxImage {
  id: string;
  url: string;
  sender?: string;
  timestamp?: Date;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setScale(1); // Reset zoom on change
  }, [images.length]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setScale(1); // Reset zoom on change
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handleNext, handlePrev]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  if (!images || images.length === 0) return null;

  const currentImage = images[currentIndex];

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(s => Math.min(s + 0.5, 4));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(s => Math.max(s - 0.5, 0.5));
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(currentImage.url, "_blank");
  };

  const lightboxContent = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white flex flex-col">
          <span className="font-medium">{currentImage.sender || "Imagen"}</span>
          {currentImage.timestamp && (
            <span className="text-xs text-white/60">
              {new Date(currentImage.timestamp).toLocaleString()}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={handleDownload} className="p-2.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all" title="Descargar / Abrir">
            <Download className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1 border-hidden" />
          <button onClick={onClose} className="p-2.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all" title="Cerrar">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* MAIN IMAGE CONTAINER */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden" onClick={onClose}>
        
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button 
              onClick={handlePrev}
              className="absolute left-4 z-20 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/80 hover:text-white transition-all transform hover:scale-110"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button 
              onClick={handleNext}
              className="absolute right-4 z-20 p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/80 hover:text-white transition-all transform hover:scale-110"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </>
        )}

        {/* IMAGE */}
        <div className="w-full h-full flex items-center justify-center p-8 md:p-16 relative">
             <img
               src={currentImage.url}
               alt="Vista previa"
               className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-200"
               style={{ transform: `scale(${scale})` }}
               onClick={(e) => e.stopPropagation()} // Prevent close on image click
               draggable={false}
             />
        </div>
        
        {/* ZOOM CONTROLS (Bottom Center) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10" onClick={(e) => e.stopPropagation()}>
           <button onClick={handleZoomOut} disabled={scale <= 0.5} className="p-2 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ZoomOut className="w-5 h-5" /></button>
           <span className="text-white/80 text-sm font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
           <button onClick={handleZoomIn} disabled={scale >= 4} className="p-2 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ZoomIn className="w-5 h-5" /></button>
        </div>
      </div>
      
      {/* THUMBNAILS CAROUSEL (Bottom) */}
      {images.length > 1 && (
        <div className="bg-black/80 p-4 border-t border-white/10 hidden md:block" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto custom-scrollbar pb-2">
             {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => { setCurrentIndex(idx); setScale(1); }}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden transition-all ${idx === currentIndex ? 'ring-2 ring-indigo-500 scale-110 opacity-100' : 'opacity-40 hover:opacity-100 ring-1 ring-white/20'}`}
                >
                   <img src={img.url} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                </button>
             ))}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(lightboxContent, document.body);
};
