import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Media,
  uploadKnowledgeDoc,
  getKnowledgeDocs,
  deleteMedia,
} from "@/services/mediaService";

// No props needed - authenticates and fetches data internally
export const KnowledgeBase: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<Media[]>([]);
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const docs = await getKnowledgeDocs();
      setDocuments(docs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error(t("knowledge_base.err_load", "Error al cargar base de conocimiento"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Client-side validation
    const maxSize = 50 * 1024 * 1024; // 50MB
    const validTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "text/csv",
    ];

    if (file.size > maxSize) {
      toast.error(t("knowledge_base.err_size", "Archivo demasiado grande (máx 50MB)"));
      return;
    }

    if (!validTypes.includes(file.type)) {
      toast.error(t("knowledge_base.err_format", "Formato no soportado"));
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading(t("knowledge_base.uploading", "Subiendo e indexando…"));

    try {
      const newDoc = await uploadKnowledgeDoc(file);
      setDocuments((prev) => [newDoc, ...prev]);
      toast.success(t("knowledge_base.upload_success", "Documento indexado"), {
        id: toastId,
      });
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : t("knowledge_base.err_upload", "Error al subir documento"),
        {
          id: toastId,
        },
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        t("knowledge_base.confirm_delete", "¿Estás seguro de eliminar este documento de la base de conocimiento?"),
      )
    )
      return;

    const toastId = toast.loading(t("knowledge_base.deleting", "Eliminando…"));
    try {
      await deleteMedia(id);
      setDocuments(documents.filter((d) => d.id !== id));
      toast.success(t("knowledge_base.delete_success", "Documento eliminado"), { id: toastId });
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : t("knowledge_base.err_delete", "Error al eliminar documento."),
        { id: toastId },
      );
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-reply-panel-dark rounded-lg shadow-sm border border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-border-dark">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <span className="text-2xl"></span> {t("knowledge_base.title", "Base de Conocimiento (RAG)")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("knowledge_base.description", "Sube documentos (PDF, TXT, DOCX) para entrenar a tu Agente IA específicamente con los datos de tu negocio.")}
        </p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all mb-8 ${dragActive ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 bg-reply-bg dark:bg-reply-surface-dark"}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="flex flex-col items-center animate-pulse">
              <div className="w-10 h-10 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
              <p className="text-indigo-600 dark:text-indigo-400 font-semibold">
                {t("knowledge_base.uploading_s3", "Subiendo e Indexando a S3...")}
              </p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                {t("knowledge_base.drag_drop", "Arrastra y suelta archivos aquí, o haz clic para seleccionar")}
              </p>
              <p className="text-xs text-gray-400">
                {t("knowledge_base.supported_formats", "Soportado: PDF, TXT, DOCX (Max 50MB)")}
              </p>
              <input
                type="file"
                id="rag-upload"
                className="hidden"
                accept=".pdf,.txt,.doc,.docx,.csv"
                onChange={(e) =>
                  e.target.files?.[0] && handleFileUpload(e.target.files[0])
                }
              />
              <label
                htmlFor="rag-upload"
                className="mt-4 inline-block text-xs bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 cursor-pointer font-bold transition-colors"
              >
                {t("knowledge_base.select_files", "Seleccionar Archivos")}
              </label>
            </>
          )}
        </div>

        {/* Document List */}
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          {t("knowledge_base.indexed_docs", "Documentos Indexados")}
          <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded-full">
            {documents.length}
          </span>
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.length === 0 && (
              <div className="text-center py-10 text-gray-400 italic bg-reply-bg dark:bg-reply-surface-dark rounded-lg border border-dashed border-gray-300 dark:border-reply-border-dark">
                {t("knowledge_base.empty_desc", "No hay documentos subidos. El bot usará solo conocimiento general.")}
              </div>
            )}
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-reply-panel-dark border border-gray-200 dark:border-reply-border-dark rounded-lg hover:shadow-md transition-all hover:border-indigo-200 dark:hover:border-indigo-800"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg flex items-center justify-center shrink-0">
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v5h5v11H6z" />
                    </svg>
                  </div>
                  <div>
                    <h4
                      className="font-semibold text-gray-800 dark:text-white text-sm hover:text-indigo-600 cursor-pointer"
                      onClick={() => window.open(doc.url, "_blank")}
                    >
                      {doc.originalName || doc.filename}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>{formatFileSize(doc.size)}</span>
                      <span>•</span>
                      <span>
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 rounded border border-green-100 dark:border-green-800 font-medium text-[10px] uppercase">
                        {t("knowledge_base.s3_secure", "S3 Secure")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-indigo-500 p-2 transition-colors"
                    title={t("knowledge_base.download", "Descargar")}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </a>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-2 transition-colors"
                    title={t("knowledge_base.delete", "Eliminar Documento")}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
