import React, { useState, useRef, useEffect } from "react";
import { API_BASE_URL } from "@/services/apiConfig";

interface AudioRecorderProps {
  onRecordingComplete: (mediaAsset: {
    url: string;
    blob: Blob;
    duration: number;
  }) => void;
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
    <div className="flex flex-col items-center justify-center p-8 bg-reply-bg dark:bg-reply-surface-dark rounded-lg">
      <div className="mb-6">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
            isRecording
              ? "bg-red-100 dark:bg-red-900/30 ring-4 ring-red-500/20 animate-pulse"
              : "bg-blue-100 dark:bg-blue-900/30"
          }`}
        >
          {isRecording ? (
            <span className="text-3xl">🎙️</span>
          ) : audioBlob ? (
            <span className="text-3xl">✅</span>
          ) : (
            <span className="text-3xl">🎤</span>
          )}
        </div>
      </div>

      <div className="text-2xl font-mono font-bold text-gray-800 dark:text-white mb-6">
        {formatTime(recordingTime)}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* CONTROLES */}
      <div className="flex gap-4">
        {!isRecording && !audioBlob && (
          <button
            onClick={startRecording}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold shadow-lg flex items-center gap-2 transition-all hover:scale-105"
          >
            <div className="w-3 h-3 bg-white rounded-full"></div>
            Grabar
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-full font-bold shadow-lg flex items-center gap-2 transition-all hover:scale-105"
          >
            <div className="w-3 h-3 bg-white rounded-sm"></div>
            Detener
          </button>
        )}

        {audioBlob && !isUploading && (
          <>
            <button
              onClick={handleRetake}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Reintentar
            </button>

            {/* Reproductor preview */}
            {audioUrl && (
              <div className="hidden">
                <audio id="preview-audio" src={audioUrl}></audio>
              </div>
            )}
            <button
              onClick={() => {
                const audio = new Audio(audioUrl!);
                audio.play();
              }}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
            >
              ▶️ Escuchar
            </button>

            <button
              onClick={handleUpload}
              className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg flex items-center gap-2"
            >
              💾 Guardar y Usar
            </button>
          </>
        )}

        {isUploading && (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            Subiendo...
          </div>
        )}
      </div>

      {!isRecording && !audioBlob && (
        <button
          onClick={onCancel}
          className="mt-8 text-sm text-gray-400 hover:text-gray-600 underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
};
