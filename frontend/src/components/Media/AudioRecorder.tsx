import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, RotateCcw, Play, Save, X } from "lucide-react";
import { API_BASE_URL } from "@/services/apiConfig";
import { MediaAsset } from "@/types/media.types";

interface AudioRecorderProps {
  onRecordingComplete: (asset: MediaAsset) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onRecordingComplete,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Limpiar recursos al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" }); // Chrome/Firefox graban en WEBM/OGG
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));

        // Detener tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleRetake = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setError(null);
  };

  const handleUpload = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      // Nombre de archivo con timestamp
      const filename = `voice_note_${Date.now()}.webm`;
      formData.append("file", audioBlob, filename);
      formData.append("type", "AUDIO");
      formData.append("category", "media-library"); // Mark as library asset for automations

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al subir la grabación");
      }

      const data = await response.json();
      // data.asset o data.media
      onRecordingComplete(data.data?.asset || data.active || data);
    } catch (err) {
      console.error("Upload failed:", err);
      setError("Error al guardar el audio. Intenta de nuevo.");
    } finally {
      setIsUploading(false);
    }
  };
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-reply-bg dark:bg-reply-surface-dark rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="mb-6">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
            isRecording
              ? "bg-red-500 ring-8 ring-red-500/20 animate-pulse text-white shadow-xl"
              : audioBlob 
                ? "bg-emerald-500 text-white shadow-lg"
                : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          }`}
        >
          {isRecording ? (
            <Mic size={40} className="animate-bounce" />
          ) : audioBlob ? (
            <Save size={40} />
          ) : (
            <Mic size={40} />
          )}
        </div>
      </div>

      <div className="text-3xl font-mono font-black text-gray-900 dark:text-white mb-8 tracking-tighter">
        {formatTime(recordingTime)}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
          <X size={16} />
          {error}
        </div>
      )}

      {/* CONTROLES */}
      <div className="flex items-center gap-4">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-black shadow-lg hover:shadow-red-500/20 flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
          >
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            INICIAR GRABACIÓN
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="px-8 py-4 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white rounded-full font-black shadow-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
          >
            <Square size={18} fill="currentColor" />
            DETENER
          </button>
        )}

        {audioBlob && !isUploading && (
          <>
            <button
              onClick={handleRetake}
              className="p-4 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              title="Reintentar"
            >
              <RotateCcw size={20} className="group-hover:rotate-[-45deg] transition-transform" />
            </button>

            <button
              onClick={() => {
                const audio = new Audio(audioUrl!);
                audio.play();
              }}
              className="px-6 py-4 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full font-bold hover:bg-indigo-200 transition-all flex items-center gap-2"
            >
              <Play size={18} fill="currentColor" />
              REPRODUCIR
            </button>

            <button
              onClick={handleUpload}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-black shadow-xl hover:shadow-emerald-500/20 flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
            >
              <Save size={18} />
              GUARDAR Y USAR
            </button>
          </>
        )}

        {isUploading && (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full shadow-sm"></div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Subiendo...</span>
          </div>
        )}
      </div>

      {!isRecording && !audioBlob && (
        <button
          onClick={onCancel}
          className="mt-10 text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 uppercase tracking-widest transition-colors"
        >
          Cancelar
        </button>
      )}
    </div>
  );
};
