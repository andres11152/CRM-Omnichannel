import React from "react";
import { useTranslation } from "react-i18next";
import { Media } from "@/services/mediaService";
import { ModuleHeader } from "../common/ModuleHeader";
import { AlertTriangle } from "lucide-react";
import { Modal, ModalButton } from "../ui/Modal";
import { useMediaLibrary } from "./useMediaLibrary";
import { MediaCard } from "./MediaCard";
import { PreviewModal } from "./PreviewModal";
import { BulkActionsBar } from "./BulkActionsBar";

interface MediaLibraryProps {
  onSelect?: (media: Media) => void;
  onClose?: () => void;
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({ onSelect, onClose }) => {
  const { t } = useTranslation();
  const lib = useMediaLibrary();

  const handleOpen = (item: Media) => {
    if (onSelect) {
      onSelect(item);
    } else {
      lib.setSelectedMedia(item);
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark font-sans"
      onDragEnter={lib.handleDragEnter}
      onDragOver={lib.handleDragOver}
      onDragLeave={lib.handleDragLeave}
      onDrop={lib.handleDrop}
    >
      {/* Header */}
      {onClose ? (
        <div className="bg-white dark:bg-reply-panel-dark px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark flex justify-between items-center shadow-sm z-10">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl">[DIR]</span> {t("media_library.select_file_title", "Seleccionar Archivo")}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <ModuleHeader
          title={t("media_library.title", "Biblioteca Multimedia")}
          description={t("media_library.subtitle", "Gestiona y visualiza todos tus activos digitales")}
          icon={
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          }
          gradient="from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800"
          stats={{ label: t("media_library.total_files", "Total Archivos"), value: lib.media.length }}
        />
      )}

      {/* Toolbar */}
      <div className="px-6 py-4 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex flex-col md:flex-row gap-4 justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar">
          {["ALL", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"].map((type) => (
            <button
              key={type}
              onClick={() => lib.setFilter(type)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                lib.filter === type
                  ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {t(
                `media_library.filters.${type.toLowerCase()}`,
                type === "ALL" ? "Todos" : type.charAt(0) + type.slice(1).toLowerCase(),
              )}
            </button>
          ))}
        </div>

        <div className="flex w-full md:w-auto gap-3">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder={t("media_library.search_placeholder", "Buscar...")}
              value={lib.search}
              onChange={(e) => lib.setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-reply-bg dark:bg-gray-800 border-none rounded-xl text-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500/50"
            />
            <svg
              className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium cursor-pointer transition-colors shadow-lg shadow-purple-500/30">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            <span className="hidden sm:inline">{t("media_library.upload", "Subir")}</span>
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files && lib.handleUpload(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {lib.loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-pulse">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
            <p>{t("media_library.loading", "Cargando biblioteca...")}</p>
          </div>
        ) : lib.media.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 dark:border-reply-border-dark rounded-3xl m-4 bg-reply-bg/50 dark:bg-gray-800/30">
            <div className="p-8 bg-white dark:bg-gray-800 rounded-full shadow-sm mb-4">
              <svg className="w-16 h-16 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-xl font-medium text-gray-600 dark:text-gray-300">{t("media_library.empty_title", "Tu biblioteca está vacía")}</p>
            <p className="text-sm mt-2">{t("media_library.empty_subtitle", "Arrastra archivos aquí o usa el botón de subir")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {lib.media.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                isSelected={lib.selectedIds.has(item.id)}
                hasSelection={lib.selectedIds.size > 0}
                onOpen={handleOpen}
                onToggleSelect={lib.toggleSelect}
                onCopyUrl={lib.copyUrl}
                onRename={lib.openRename}
                onDelete={lib.handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {lib.selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={lib.selectedIds.size}
          totalCount={lib.media.length}
          onSelectAll={lib.selectAll}
          onDeleteSelected={() => lib.handleDelete(Array.from(lib.selectedIds))}
          onCancel={() => lib.setSelectedIds(new Set())}
        />
      )}

      {/* Drag Overlay */}
      {lib.isDragging && (
        <div className="fixed inset-0 bg-purple-600/90 backdrop-blur-md z-50 flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="text-center text-white p-10 border-4 border-white/30 rounded-3xl border-dashed">
            <svg className="w-24 h-24 mx-auto mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <h2 className="text-3xl font-bold">{t("media_library.drop_title", "Suelta tus archivos aquí")}</h2>
            <p className="text-lg opacity-80 mt-2">{t("media_library.drop_subtitle", "Se subirán instantáneamente a tu nube")}</p>
          </div>
        </div>
      )}

      {/* Full Screen Preview Modal */}
      {lib.selectedMedia && (
        <PreviewModal
          media={lib.selectedMedia}
          onClose={() => lib.setSelectedMedia(null)}
          onRename={lib.openRename}
          onCopyUrl={lib.copyUrl}
          onDelete={lib.handleDelete}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!lib.mediaToDelete}
        onClose={() => lib.setMediaToDelete(null)}
        size="sm"
        hideCloseButton
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => lib.setMediaToDelete(null)}>
              {t("media_library.cancel", "Cancelar")}
            </ModalButton>
            <ModalButton variant="danger" onClick={lib.confirmDelete}>
              {t("media_library.confirm_delete", "Sí, Eliminar")}
            </ModalButton>
          </>
        }
      >
        <div className="text-center py-2">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {lib.mediaToDelete?.length === 1
              ? t("media_library.delete_confirm.title_one", "¿Eliminar archivo permanentemente?")
              : t("media_library.delete_confirm.title_many", "¿Eliminar {{count}} archivos permanentemente?", { count: lib.mediaToDelete?.length || 0 })}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {t("media_library.delete_confirm.body_prefix", "Esta acción no se puede deshacer.")}{" "}
            {lib.mediaToDelete?.length === 1
              ? t("media_library.delete_confirm.body_one", "El archivo desaparecerá")
              : t("media_library.delete_confirm.body_many", "Los archivos desaparecerán")}{" "}
            {t("media_library.delete_confirm.body_suffix", "de tu biblioteca y de cualquier chat donde se hayan compartido.")}
          </p>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal
        isOpen={!!lib.renamingMedia}
        onClose={() => lib.setRenamingMedia(null)}
        title={t("media_library.rename_modal.title", "Renombrar Archivo")}
        size="sm"
        busy={lib.isRenaming}
        footer={
          <>
            <ModalButton variant="secondary" onClick={() => lib.setRenamingMedia(null)}>
              {t("media_library.cancel", "Cancelar")}
            </ModalButton>
            <ModalButton variant="primary" onClick={lib.confirmRename} loading={lib.isRenaming}>
              {t("media_library.rename_modal.save", "Guardar")}
            </ModalButton>
          </>
        }
      >
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">{t("media_library.rename_modal.name_label", "Nombre")}</label>
          <input
            type="text"
            value={lib.renameDraft}
            onChange={(e) => lib.setRenameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lib.confirmRename()}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
          />
          {lib.renamingMedia?.type === "AUDIO" && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("media_library.rename_modal.audio_hint", "Este nombre te ayudará a identificar la nota de voz al reutilizarla en cualquier chat o chatbot.")}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};
