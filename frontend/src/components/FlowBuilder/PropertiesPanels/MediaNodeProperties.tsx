import React, { useState } from "react";
import { FlowNode } from "@/types";
import { MediaSelectorModal } from "../MediaSelectorModal";

export interface NodePropertiesProps {
  node: FlowNode;
  onUpdate: (key: string, value: unknown) => void;
}

export const MediaNodeProperties: React.FC<NodePropertiesProps> = ({ node, onUpdate }) => {
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaModalType, setMediaModalType] = useState<"IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT">("IMAGE");

  const renderMediaSelector = (
    type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
    title: string,
    description: string,
    colorClass: string,
    icon: React.ReactNode,
    urlField: string
  ) => {
    const urlValue = (node.data.mediaUrl as string | undefined) || ((node.data as Record<string, unknown>)[urlField] as string | undefined);
    const fileName = (urlValue || "").split("/").pop();

    return (
      <>
        <div className={`bg-${colorClass}-50 dark:bg-${colorClass}-900/20 p-3 rounded-lg border border-${colorClass}-200 dark:border-${colorClass}-800 mb-3`}>
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-xs font-bold text-${colorClass}-900 dark:text-${colorClass}-300`}>
              {title}
            </p>
          </div>
          <p className={`text-xs text-${colorClass}-700 dark:text-${colorClass}-400`}>
            {description}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            Archivo Seleccionado
          </label>
          {urlValue && (
            <div className="mb-2 p-2 bg-reply-bg dark:bg-gray-800 rounded border border-gray-200 dark:border-reply-border-dark flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                {fileName}
              </span>
              <button
                onClick={() => {
                  onUpdate("mediaUrl", "");
                  onUpdate(urlField, "");
                }}
                className="text-red-500 hover:text-red-700"
              >
                X
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setMediaModalType(type);
              setShowMediaModal(true);
            }}
            className={`mt-2 w-full bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 hover:from-${colorClass}-600 hover:to-${colorClass}-700 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg`}
          >
            {icon} Seleccionar de Biblioteca Multimedia
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
            {type === "DOCUMENT" ? "Nombre del Archivo (Opcional)" : "Mensaje Opcional (Caption)"}
          </label>
          {type === "DOCUMENT" ? (
            <>
              <input
                type="text"
                placeholder="catalogo.pdf"
                value={node.data.filename || ""}
                onChange={(e) => onUpdate("filename", e.target.value)}
                className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-${colorClass}-500 outline-none`}
              />
              <p className="text-xs text-gray-400 mt-1">El nombre que verá el usuario al descargar</p>
            </>
          ) : (
            <textarea
              rows={2}
              placeholder="Texto que acompaña..."
              value={node.data.message || node.data.content || ""}
              onChange={(e) => onUpdate("message", e.target.value)}
              className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-reply-surface-dark text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-${colorClass}-500 outline-none`}
            />
          )}
        </div>
        
        {showMediaModal && (
          <MediaSelectorModal
            type={mediaModalType}
            onSelect={(asset) => {
              const url = asset.fileUrl || asset.url;
              onUpdate("mediaUrl", url);
              onUpdate("mediaAssetId", asset.id);

              if (mediaModalType === "IMAGE") onUpdate("imageUrl", url);
              if (mediaModalType === "VIDEO") onUpdate("videoUrl", url);
              if (mediaModalType === "AUDIO") onUpdate("audioUrl", url);
              if (mediaModalType === "DOCUMENT") onUpdate("documentUrl", url);

              setShowMediaModal(false);
            }}
            onClose={() => setShowMediaModal(false)}
          />
        )}
      </>
    );
  };

  switch (node.type) {
    case "send_image":
      return renderMediaSelector("IMAGE", "Enviar Imagen", "Envía una imagen al usuario por WhatsApp", "blue", <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/></svg>, "imageUrl");
    case "send_video":
      return renderMediaSelector("VIDEO", "Enviar Video", "Envía un video al usuario por WhatsApp", "purple", <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/></svg>, "videoUrl");
    case "send_audio":
      return renderMediaSelector("AUDIO", "Enviar Audio", "Envía un archivo de audio o nota de voz", "green", <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" /></svg>, "audioUrl");
    case "send_document":
      return renderMediaSelector("DOCUMENT", "Enviar Documento", "Envía un PDF, Word, Excel u otro documento", "gray", <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>, "documentUrl");
    default:
      return null;
  }
};
