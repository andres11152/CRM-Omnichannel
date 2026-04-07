import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceNotePlayerProps {
  src: string;
  duration?: number; // Optional initial duration
  variant?: 'sent' | 'received';
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ src, duration: initialDuration, variant = 'received' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to || 1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate waveform bars (Simulated)
  useEffect(() => {
    // Generate bars with 30-100% height for maximum visibility
    // Using random is safer for visibility than hash which might produce low values
    const bars = Array.from({ length: 45 }, () => 30 + Math.floor(Math.random() * 70));
    setWaveformBars(bars);
  }, []); // Run once on mount

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.addEventListener('ended', handleEnded);
        // Pause others when I start
        audioRef.current.addEventListener('play', handlePlayStart);
        
        return () => {
            audioRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
            audioRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audioRef.current?.removeEventListener('ended', handleEnded);
            audioRef.current?.removeEventListener('play', handlePlayStart);
        };
    }
  }, []);

  const handlePlayStart = () => {
      // Create a native-like experience: Stop all other audios
      document.querySelectorAll('audio').forEach((el) => {
          if (el !== audioRef.current && !el.paused) {
              el.pause();
          }
      });
  };
  
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      const prog = audioRef.current.currentTime / audioRef.current.duration;
      setProgress(isNaN(prog) ? 0 : prog);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // The 'play' listener handles pausing others
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const togglePlaybackRate = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    
    if (audioRef.current) {
        audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const clickProgress = x / width;
    
    if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
        audioRef.current.currentTime = clickProgress * audioRef.current.duration;
        setProgress(clickProgress);
    }
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="flex items-center gap-3 p-2 min-w-[200px] select-none">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      {/* Play/Pause Button */}
      <button 
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shrink-0"
      >
        {isPlaying ? (
          <Pause size={16} className="text-gray-700 dark:text-gray-200 fill-current" />
        ) : (
          <Play size={16} className="text-gray-700 dark:text-gray-200 fill-current ml-1" />
        )}
      </button>

      {/* Waveform Visualization */}
      <div 
        className="flex-1 h-8 flex items-center gap-[2px] cursor-pointer relative group"
        onClick={handleSeek}
      >
        {waveformBars.map((height, i) => {
             const barProgress = i / waveformBars.length;
             const isPlayed = barProgress <= progress;
             return (
                 <div
                    key={i}
                    className={`w-[3px] rounded-full transition-colors duration-100 ${
                        isPlayed 
                            ? 'bg-sky-600 dark:bg-sky-400' // Played Color (WhatsApp Blue)
                            : variant === 'sent' 
                                ? 'bg-emerald-500 dark:bg-emerald-500' // Sent (Green Bubble) Unplayed - SOLID
                                : 'bg-gray-500 dark:bg-gray-500 group-hover:bg-gray-600' // Received (Gray Bubble) Unplayed - SOLID
                    }`}
                    style={{ height: `${height}%` }}
                 />
             );
        })}
      </div>

      {/* Speed Control */}
      <button 
        onClick={togglePlaybackRate}
        className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-[10px] font-bold text-gray-700 dark:text-gray-300 shrink-0 transition-colors"
      >
        {playbackRate}x
      </button>

      {/* Time */}
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums w-10 text-right">
        {formatTime(isPlaying ? currentTime : duration)}
      </span>
    </div>
  );
};
