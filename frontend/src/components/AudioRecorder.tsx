import React, { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Send, Pause, Play, Square } from "lucide-react";

interface AudioRecorderProps {
  /** name: optional, user-entered during preview — lets a voice note be
   * saved to the Media Library under a specific, reusable name instead of
   * a generic "voice-note.webm". */
  onSend: (blob: Blob, name?: string) => void;
  onCancel: () => void;
}

type RecorderPhase = "recording" | "paused" | "preview";

// Safety cap: auto-stop into preview after 5 minutes
const MAX_DURATION_SECONDS = 300;

/**
 * 🎙️ ENTERPRISE VOICE NOTE RECORDER
 *
 * Flow (WhatsApp-parity plus review step):
 *  - Records WebM/Opus (backend converts to OGG/Opus mono 16kHz and sends ptt:true).
 *  - Pause/Resume while recording.
 *  - Square (stop) → PREVIEW: listen to the take before sending, then Send or Discard.
 *  - Send button while recording stops and sends immediately (classic fast path).
 */
export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onSend,
  onCancel,
}) => {
  const [phase, setPhase] = useState<RecorderPhase>("recording");
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [voiceName, setVoiceName] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Drives the visualizer loop. A plain state value gets captured stale inside the
  // requestAnimationFrame closure (the old code froze the waveform because of that).
  const visualizerActiveRef = useRef(true);
  const durationRef = useRef(0);

  useEffect(() => {
    startRecording();
    return () => {
      hardCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDuration((prev) => {
        const next = prev + 1;
        durationRef.current = next;
        if (next >= MAX_DURATION_SECONDS) {
          // Auto-stop into preview at the cap
          stopToPreview();
        }
        return next;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      //  Prefer Opus codec for better WhatsApp compatibility
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.start();
      startTimer();
      setupVisualizer(stream);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      onCancel();
    }
  };

  const setupVisualizer = (stream: MediaStream) => {
    if (!canvasRef.current) return;

    audioContextRef.current = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 64; // Fewer bars for wider cleaner look
    source.connect(analyserRef.current);

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!visualizerActiveRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      if (!ctx || !analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 0.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const item = dataArray[i];
        const barHeight = Math.max(2, (item / 255) * height * 1.5);
        const y = (height - barHeight) / 2;

        ctx.fillStyle =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "#8696a0"
            : "#667781";

        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }

        x += width / bufferLength;
      }
    };

    draw();
  };

  const stopVisualizer = () => {
    visualizerActiveRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch((e) => console.warn(e));
    }
  };

  const hardCleanup = () => {
    stopTimer();
    stopVisualizer();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
    }
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  };

  // ── Recording controls ──────────────────────────────────────

  const handlePauseResume = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (phase === "recording") {
      rec.pause();
      stopTimer();
      visualizerActiveRef.current = false;
      setPhase("paused");
    } else if (phase === "paused") {
      rec.resume();
      startTimer();
      visualizerActiveRef.current = true;
      // Re-kick the animation loop
      setupResumeDraw();
      setPhase("recording");
    }
  };

  // Restart the rAF loop after resume (analyser/context stay alive across pause)
  const setupResumeDraw = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!visualizerActiveRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 0.8;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.max(2, (dataArray[i] / 255) * height * 1.5);
        const y = (height - barHeight) / 2;
        ctx.fillStyle =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "#8696a0"
            : "#667781";
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barHeight);
        }
        x += width / bufferLength;
      }
    };
    draw();
  };

  const finalizeRecording = (onBlobReady: (blob: Blob) => void) => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    rec.onstop = () => {
      const finalMime = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });
      rec.stream.getTracks().forEach((track) => track.stop());
      onBlobReady(blob);
    };
    stopTimer();
    stopVisualizer();
    if (rec.state !== "inactive") rec.stop();
  };

  /** Square button: stop and review before sending */
  const stopToPreview = () => {
    finalizeRecording((blob) => {
      previewBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPhase("preview");
    });
  };

  /** Send button while recording: stop and send immediately (fast path) */
  const handleSendNow = () => {
    if (phase === "preview") {
      if (previewBlobRef.current)
        onSend(previewBlobRef.current, voiceName.trim() || undefined);
      return;
    }
    finalizeRecording((blob) => onSend(blob));
  };

  const handleDiscard = () => {
    hardCleanup();
    onCancel();
  };

  // ── Preview playback ────────────────────────────────────────

  const togglePreviewPlayback = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlayingPreview(true);
    } else {
      el.pause();
      setIsPlayingPreview(false);
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ── RENDER ──────────────────────────────────────────────────

  if (phase === "preview") {
    return (
      <div className="flex flex-col w-full px-2 py-1 gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex items-center w-full">
        {/* DISCARD */}
        <button
          onClick={handleDiscard}
          className="p-3 text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-full transition-all group"
          title="Descartar nota de voz"
        >
          <Trash2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>

        {/* PREVIEW PLAYER */}
        <div className="flex-1 flex items-center gap-3 mx-3 bg-gray-100 dark:bg-white/10 rounded-full px-3 py-2">
          <button
            onClick={togglePreviewPlayback}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
            title={isPlayingPreview ? "Pausar" : "Escuchar"}
          >
            {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Progress bar */}
          <div className="flex-1 h-1.5 bg-gray-300 dark:bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-[width] duration-150"
              style={{ width: `${playbackProgress}%` }}
            />
          </div>

          <span className="text-gray-700 dark:text-gray-200 text-sm font-mono font-medium min-w-fit">
            {formatTime(duration)}
          </span>

          {previewUrl && (
            <audio
              ref={audioElRef}
              src={previewUrl}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (el.duration && isFinite(el.duration)) {
                  setPlaybackProgress((el.currentTime / el.duration) * 100);
                }
              }}
              onEnded={() => {
                setIsPlayingPreview(false);
                setPlaybackProgress(0);
              }}
              className="hidden"
            />
          )}
        </div>

        {/* SEND */}
        <button
          onClick={handleSendNow}
          className="p-3 bg-reply-brand hover:bg-[#008f6f] text-white rounded-full shadow-lg transform active:scale-95 transition-all flex items-center justify-center"
          title="Enviar nota de voz"
        >
          <Send className="w-5 h-5 ml-0.5" />
        </button>
      </div>

      {/* OPTIONAL NAME: saved to the Media Library under this name so the
          note can be found and reused later in any chat or chatbot flow. */}
      <input
        type="text"
        value={voiceName}
        onChange={(e) => setVoiceName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSendNow()}
        placeholder="Nombre para reutilizar en la Biblioteca (opcional)"
        maxLength={150}
        className="ml-14 mr-3 px-3 py-1.5 text-xs bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500/50 outline-none"
      />
      </div>
    );
  }

  return (
    <div className="flex items-center w-full px-2 py-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {/* DELETE BUTTON */}
      <button
        onClick={handleDiscard}
        className="p-3 text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-full transition-all group"
        title="Cancelar grabación"
      >
        <Trash2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>

      {/* CENTER: Rec Indicator + Timer + Visualizer */}
      <div className="flex-1 flex items-center gap-4 mx-4">
        <div className="flex items-center gap-2 min-w-fit">
          <span
            className={`w-3 h-3 rounded-full ${
              phase === "paused"
                ? "bg-amber-500"
                : "bg-red-500 animate-[pulse_1.5s_ease-in-out_infinite]"
            }`}
          />
          <span className="text-gray-800 dark:text-gray-200 text-lg font-mono font-medium tracking-wide">
            {formatTime(duration)}
          </span>
          {phase === "paused" && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Pausado
            </span>
          )}
        </div>

        <div className="flex-1 h-8 flex items-center opacity-80">
          <canvas
            ref={canvasRef}
            width={200}
            height={32}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* PAUSE / RESUME */}
      <button
        onClick={handlePauseResume}
        className="p-3 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-white/10 rounded-full transition-all active:scale-90"
        title={phase === "paused" ? "Reanudar" : "Pausar"}
      >
        {phase === "paused" ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
      </button>

      {/* STOP → PREVIEW */}
      <button
        onClick={stopToPreview}
        className="p-3 text-gray-600 dark:text-gray-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-white/10 rounded-full transition-all active:scale-90"
        title="Detener y escuchar antes de enviar"
      >
        <Square className="w-5 h-5 fill-current" />
      </button>

      {/* SEND NOW */}
      <button
        onClick={handleSendNow}
        className="p-3 bg-reply-brand hover:bg-[#008f6f] text-white rounded-full shadow-lg transform active:scale-95 transition-all flex items-center justify-center ml-1"
        title="Enviar ahora"
      >
        <Send className="w-5 h-5 ml-0.5" />
      </button>
    </div>
  );
};
