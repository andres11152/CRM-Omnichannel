import React, { useState, useRef, useEffect } from "react";
import { X, Mic, Square, Play, Pause, RotateCcw, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useTranslation } from "react-i18next";

interface VoiceRecorderModalProps {
  onClose: () => void;
  onConfirm: (file: File) => void;
}

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordTime, setRecordTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startTimer = () => {
    setRecordTime(0);
    timerRef.current = setInterval(() => {
      setRecordTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Determine mimeType (WhatsApp/Baileys standard is audio/ogg; codecs=opus)
      let options = { mimeType: "audio/ogg; codecs=opus" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "audio/webm; codecs=opus" };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Stop all audio track streams to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error("Microphone access error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const resetRecording = () => {
    stopTimer();
    setIsRecording(false);
    setIsPlaying(false);
    setAudioUrl(null);
    setRecordTime(0);
    audioChunksRef.current = [];
  };

  const handleConfirmAudio = () => {
    if (audioChunksRef.current.length === 0) return;

    const mimeType = mediaRecorderRef.current?.mimeType || "audio/ogg; codecs=opus";
    const extension = mimeType.includes("ogg") ? "ogg" : "webm";
    
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    const audioFile = new File([audioBlob], `voice-note-${Date.now()}.${extension}`, {
      type: mimeType,
    });

    onConfirm(audioFile);
  };

  return (
    <Modal isOpen onClose={onClose} title={t("chat.record_audio", "Grabar Nota de Voz")} size="sm">
      <div className="flex flex-col items-center justify-center p-6 space-y-6">
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={handleAudioEnded}
            className="hidden"
          />
        )}

        <div className="text-3xl font-mono font-bold tracking-wider text-gray-700 dark:text-gray-200">
          {formatTime(recordTime)}
        </div>

        <div className="flex items-center justify-center space-x-6">
          {!audioUrl ? (
            !isRecording ? (
              <button
                onClick={startRecording}
                className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
              >
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-16 h-16 bg-gray-800 hover:bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 animate-pulse"
              >
                <Square className="w-7 h-7" />
              </button>
            )
          ) : (
            <>
              <button
                onClick={resetRecording}
                className="w-12 h-12 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-200 rounded-full flex items-center justify-center transition-transform active:scale-95"
                title={t("common.reset", "Volver a grabar")}
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlayback}
                className="w-16 h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>

              <button
                onClick={handleConfirmAudio}
                className="w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-transform active:scale-95"
                title={t("common.use_audio", "Usar grabación")}
              >
                <Check className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          {!audioUrl
            ? isRecording
              ? t("chat.recording_desc", "Grabando... Haz clic en el botón cuadrado para detener.")
              : t("chat.start_record_desc", "Haz clic en el micrófono para iniciar grabación.")
            : t("chat.preview_record_desc", "Escucha tu grabación o confírmala para programar.")}
        </p>
      </div>
    </Modal>
  );
};
