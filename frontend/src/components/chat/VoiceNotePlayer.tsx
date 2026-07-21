import React, { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

interface VoiceNotePlayerProps {
  url: string;
  isAgent?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ url, isAgent }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const cyclePlaybackRate = () => {
    let nextRate: number;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const animate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
        setProgress((audio.currentTime / audio.duration) * 100 || 0);
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audio.currentTime = 0;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    const handlePlay = () => {
      if (audio) {
        audio.playbackRate = playbackRate;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    const handlePause = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [url, playbackRate]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.play().catch(err => console.error("Audio playback error:", err));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current && duration) {
      const value = Number(e.target.value);
      audioRef.current.currentTime = (value / 100) * duration;
      setCurrentTime((value / 100) * duration);
      setProgress(value);
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const currentDisplayTime = isPlaying || currentTime > 0 ? currentTime : duration;

  return (
    <div className={`flex items-center gap-3 p-2 rounded-full min-w-[250px] max-w-[320px] ${isAgent ? "bg-white/10" : "bg-gray-100 dark:bg-white/5"}`}>
      <audio ref={audioRef} src={url} preload="metadata" />
      
      {/* Play/Pause Button */}
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 ${isAgent ? "bg-white text-reply-brand hover:bg-white/90" : "bg-reply-brand text-white hover:bg-[#009676]"}`}
      >
        {isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} className="ml-1" />}
      </button>

      {/* Waveform / Progress Slider */}
      <div className="flex-1 flex flex-col justify-center">
        <input
          type="range"
          min="0"
          max="100"
          value={progress || 0}
          onChange={handleSeek}
          className={`w-full h-1.5 appearance-none rounded-full cursor-pointer ${isAgent ? "bg-white/30 accent-white" : "bg-gray-300 dark:bg-gray-600 accent-reply-brand"}`}
          style={{
            background: `linear-gradient(to right, ${isAgent ? '#ffffff' : '#00a884'} ${progress}%, ${isAgent ? 'rgba(255,255,255,0.3)' : 'rgba(156,163,175,0.3)'} ${progress}%)`
          }}
        />
        <div className={`text-[10px] mt-1 font-medium ${isAgent ? "text-white/80" : "text-gray-500"}`}>
          {formatTime(currentDisplayTime)}
        </div>
      </div>
      
      {/* Speed Control Button */}
      <button
        onClick={cyclePlaybackRate}
        className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded transition-all active:scale-90 border select-none ${
          isAgent
            ? "bg-white/10 hover:bg-white/20 border-white/20 text-white"
            : "bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-200"
        }`}
        title="Velocidad de reproducción"
      >
        {playbackRate}x
      </button>

      {/* Mic Icon (Visual Decorator) */}
      <div className={`shrink-0 mr-1 ${isAgent ? "text-white/50" : "text-gray-400"}`}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.468 2.349 8.468 4.35v7.061c0 2.001 1.53 3.53-3.531 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2.002z"></path>
        </svg>
      </div>
    </div>
  );
};
