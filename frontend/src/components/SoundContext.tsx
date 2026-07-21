import React, { createContext, useContext, useState, useEffect } from 'react';

// Base64 Sound Assets (Short, optimized)
// "Pop" for general notifications
const POP_SOUND = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU..."; 

// "Ping" for messages (Slack/like) - Mocking with a placeholder for now, will use a real short base64 in implementation
// Using a very short beep for demo purposes to keep file size small in prompt, 
// Real implementation should use proper high-quality base64 strings.
const MSG_SOUND = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YXIGAACBhYqFbF1x...";

// "Success" for deals
const SUCCESS_SOUND = "data:audio/wav;base64,UklGRiZbAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVZbA...";

type SoundType = 'message' | 'success' | 'error' | 'pop';

interface SoundContextType {
  playSound: (type: SoundType) => void;
  isMuted: boolean;
  toggleMute: () => void;
  volume: number;
  setVolume: (volume: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(0.7);

  useEffect(() => {
    const savedMute = localStorage.getItem('crm_sound_mute');
    if (savedMute) setIsMuted(savedMute === 'true');
    
    const savedVolume = localStorage.getItem('crm_sound_volume');
    if (savedVolume) setVolumeState(parseFloat(savedVolume));
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    localStorage.setItem('crm_sound_mute', String(newState));
  };

  const setVolume = (newVolume: number) => {
    setVolumeState(newVolume);
    localStorage.setItem('crm_sound_volume', String(newVolume));
  };

  const playSound = (type: SoundType) => {
    if (isMuted) return;

    let audioSrc: string;
    switch (type) {
      case 'message':
        // Real Base64 will be injected here
        audioSrc = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'; // Professional notification
        break;
      case 'success':
        audioSrc = 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'; // Success chime
        break;
      case 'error':
        audioSrc = 'https://assets.mixkit.co/active_storage/sfx/950/950-preview.mp3'; // Error tone
        break;
      case 'pop':
      default:
        audioSrc = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'; // Pop
        break;
    }

    if (audioSrc) {
       const audio = new Audio(audioSrc);
       audio.volume = volume;
       audio.play().catch(e => console.error("Audio play failed", e));
    }
  };

  return (
    <SoundContext.Provider value={{ playSound, isMuted, toggleMute, volume, setVolume }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
// ... hook existing code ...
  return context;
};

export const SoundToggle: React.FC = () => {
    const { isMuted, toggleMute } = useSound();
    return (
        <button
            onClick={toggleMute}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title={isMuted ? "Activar Sonido" : "Silenciar Sonido"}
        >
            {isMuted ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
            ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
            )}
        </button>
    );    
}
