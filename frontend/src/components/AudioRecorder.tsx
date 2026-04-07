import React, { useState, useRef, useEffect } from "react";
import { Trash2, Send, Mic } from "lucide-react";

interface AudioRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onSend,
  onCancel,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopRecordingAndCleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      setIsRecording(true);

      // Timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      // Visualizer
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
      if (!isRecording) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      // Sometimes this might be unmounted, check
      if (!ctx) return;

      analyserRef.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 0.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // Normalize value mostly for low volume speech
        const item = dataArray[i];
        const barHeight = Math.max(2, (item / 255) * height * 1.5);

        // Centered bars
        const y = (height - barHeight) / 2;

        // Gradient or Solid color
        ctx.fillStyle = "#667781"; // WhatsApp gray audio bar color (dark mode style)
        // If system is dark mode, maybe white? Using a neutral gray is safe for both.
        if (
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        ) {
          ctx.fillStyle = "#8696a0"; // Lighter gray for dark mode
        }

        // Rounded caps manually or just rects
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

  const stopRecordingAndCleanup = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch((e) => console.warn(e));
    }
  };

  const handleStop = () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = () => {
      const finalMime = mediaRecorderRef.current?.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });

      mediaRecorderRef.current?.stream
        .getTracks()
        .forEach((track) => track.stop());
      onSend(blob);
    };

    stopRecordingAndCleanup();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center w-full px-2 py-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {/* DELETE BUTTON */}
      <button
        onClick={onCancel}
        className="p-3 text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-full transition-all group"
        title="Cancelar grabación"
      >
        <Trash2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>

      {/* CENTER: Rec Indicator + Timer + Visualizer */}
      <div className="flex-1 flex items-center gap-4 mx-4">
        <div className="flex items-center gap-2 min-w-fit">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-[pulse_1.5s_ease-in-out_infinite]" />
          <span className="text-gray-800 dark:text-gray-200 text-lg font-mono font-medium tracking-wide">
            {formatTime(duration)}
          </span>
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

      {/* SEND BUTTON */}
      <button
        onClick={handleStop}
        className="p-3 bg-reply-brand hover:bg-[#008f6f] text-white rounded-full shadow-lg transform active:scale-95 transition-all flex items-center justify-center"
      >
        <Send className="w-5 h-5 ml-0.5" />
      </button>
    </div>
  );
};
