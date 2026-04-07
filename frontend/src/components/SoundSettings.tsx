import React, { useState, useEffect } from "react";
import { useSound } from "./SoundContext";
import "../styles/SoundSettings.css";

/**
 * [SOUND] PROFESSIONAL SOUND SETTINGS PANEL
 * Complete audio configuration for CRM notifications
 */

interface SoundPreferences {
  enabled: boolean;
  volume: number;
  sounds: {
    message: string;
    success: string;
    error: string;
    warning: string;
    call: string;
    ticket: string;
  };
  notificationTypes: {
    newMessage: boolean;
    newTicket: boolean;
    ticketAssigned: boolean;
    dealWon: boolean;
    dealLost: boolean;
    callIncoming: boolean;
    systemAlert: boolean;
  };
}

const DEFAULT_PREFERENCES: SoundPreferences = {
  enabled: true,
  volume: 0.7,
  sounds: {
    message: "default",
    success: "default",
    error: "default",
    warning: "default",
    call: "default",
    ticket: "default",
  },
  notificationTypes: {
    newMessage: true,
    newTicket: true,
    ticketAssigned: true,
    dealWon: true,
    dealLost: false,
    callIncoming: true,
    systemAlert: true,
  },
};

// Available sound themes
const SOUND_THEMES = [
  {
    id: "default",
    name: "Default",
    description: "Professional notification sounds",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Subtle, non-intrusive tones",
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional notification sounds",
  },
  { id: "modern", name: "Modern", description: "Contemporary UI sounds" },
  { id: "nature", name: "Nature", description: "Calm, natural sounds" },
];

export const SoundSettings: React.FC = () => {
  const { playSound, isMuted, toggleMute, setVolume, volume } = useSound();
  const [preferences, setPreferences] =
    useState<SoundPreferences>(DEFAULT_PREFERENCES);
  const [activeTab, setActiveTab] = useState<
    "general" | "sounds" | "notifications"
  >("general");
  const [testingSound, setTestingSound] = useState<string | null>(null);

  // Load preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("crm_sound_preferences");
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load sound preferences", e);
      }
    }
  }, []);

  // Save preferences to localStorage
  const savePreferences = (newPrefs: SoundPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem("crm_sound_preferences", JSON.stringify(newPrefs));
  };

  // Handle volume change
  const handleVolumeChange = (newVolume: number) => {
    const updated = { ...preferences, volume: newVolume };
    savePreferences(updated);
    setVolume(newVolume);
  };

  // Handle notification type toggle
  const toggleNotificationType = (
    type: keyof SoundPreferences["notificationTypes"],
  ) => {
    const updated = {
      ...preferences,
      notificationTypes: {
        ...preferences.notificationTypes,
        [type]: !preferences.notificationTypes[type],
      },
    };
    savePreferences(updated);
  };

  // Test sound
  const testSound = (soundType: "message" | "success" | "error" | "pop") => {
    setTestingSound(soundType);
    playSound(soundType);
    setTimeout(() => setTestingSound(null), 1000);
  };

  // Reset to defaults
  const resetToDefaults = () => {
    if (
      confirm(
        "¿Resetear todas las configuraciones de sonido a los valores predeterminados?",
      )
    ) {
      savePreferences(DEFAULT_PREFERENCES);
      setVolume(DEFAULT_PREFERENCES.volume);
    }
  };

  return (
    <div className="sound-settings-container">
      <div className="sound-settings-header">
        <div className="header-content">
          <div className="header-icon">
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
                d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
            </svg>
          </div>
          <div>
            <h2>Configuración de Sonido</h2>
            <p className="subtitle">
              Personaliza las notificaciónes de audio del CRM
            </p>
          </div>
        </div>
        <div className="header-status">
          <div
            className={`status-indicator ${!isMuted ? "active" : "inactive"}`}
          >
            <span className="status-dot"></span>
            {isMuted ? "Silenciado" : "Activo"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sound-tabs">
        <button
          className={`tab ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
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
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
          General
        </button>
        <button
          className={`tab ${activeTab === "sounds" ? "active" : ""}`}
          onClick={() => setActiveTab("sounds")}
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
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
          Sonidos
        </button>
        <button
          className={`tab ${activeTab === "notifications" ? "active" : ""}`}
          onClick={() => setActiveTab("notifications")}
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
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          Notificaciones
        </button>
      </div>

      {/* Content */}
      <div className="sound-content">
        {/* GENERAL TAB */}
        {activeTab === "general" && (
          <div className="settings-section">
            {/* Master Enable/Disable */}
            <div className="setting-card">
              <div className="setting-row">
                <div className="setting-info">
                  <h3>Habilitar Sonidos</h3>
                  <p>Activar o desactivar todos los sonidos de notificación</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={!isMuted}
                    onChange={toggleMute}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            {/* Volume Control */}
            <div className="setting-card">
              <div className="setting-info">
                <h3>Volumen</h3>
                <p>Ajusta el volumen de las notificaciónes de audio</p>
              </div>
              <div className="volume-control">
                <div className="volume-icons">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.volume * 100}
                  onChange={(e) =>
                    handleVolumeChange(parseInt(e.target.value) / 100)
                  }
                  className="volume-slider"
                  disabled={isMuted}
                />
                <div className="volume-icons">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                </div>
                <span className="volume-value">
                  {Math.round(preferences.volume * 100)}%
                </span>
              </div>
            </div>

            {/* Sound Test */}
            <div className="setting-card">
              <div className="setting-info">
                <h3>Probar Sonidos</h3>
                <p>Reproduce sonidos de ejemplo para verificar el volumen</p>
              </div>
              <div className="sound-test-buttons">
                <button
                  className={`test-button ${
                    testingSound === "message" ? "testing" : ""
                  }`}
                  onClick={() => testSound("message")}
                  disabled={isMuted}
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  Mensaje
                </button>
                <button
                  className={`test-button ${
                    testingSound === "success" ? "testing" : ""
                  }`}
                  onClick={() => testSound("success")}
                  disabled={isMuted}
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Éxito
                </button>
                <button
                  className={`test-button ${
                    testingSound === "error" ? "testing" : ""
                  }`}
                  onClick={() => testSound("error")}
                  disabled={isMuted}
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
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Error
                </button>
                <button
                  className={`test-button ${
                    testingSound === "pop" ? "testing" : ""
                  }`}
                  onClick={() => testSound("pop")}
                  disabled={isMuted}
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Alerta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SOUNDS TAB */}
        {activeTab === "sounds" && (
          <div className="settings-section">
            <div className="setting-card">
              <div className="setting-info">
                <h3>Tema de Sonido</h3>
                <p>Selecciona un conjunto de sonidos predefinidos</p>
              </div>
              <div className="sound-themes">
                {SOUND_THEMES.map((theme) => (
                  <div
                    key={theme.id}
                    className={`theme-card ${
                      preferences.sounds.message === theme.id ? "selected" : ""
                    }`}
                    onClick={() => {
                      const updated = {
                        ...preferences,
                        sounds: {
                          message: theme.id,
                          success: theme.id,
                          error: theme.id,
                          warning: theme.id,
                          call: theme.id,
                          ticket: theme.id,
                        },
                      };
                      savePreferences(updated);
                    }}
                  >
                    <div className="theme-icon">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                      </svg>
                    </div>
                    <div className="theme-info">
                      <h4>{theme.name}</h4>
                      <p>{theme.description}</p>
                    </div>
                    {preferences.sounds.message === theme.id && (
                      <div className="theme-check">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="info-banner">
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
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p>
                Los sonidos personalizados se aplicarn a todos los tipos de
                notificaciónes
              </p>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === "notifications" && (
          <div className="settings-section">
            <div className="setting-card">
              <div className="setting-info">
                <h3>Tipos de Notificación</h3>
                <p>Selecciona qué eventos deben reproducir sonido</p>
              </div>

              <div className="notification-types">
                <div className="notification-item">
                  <div className="notification-icon message">
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
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Nuevo Mensaje</h4>
                    <p>Cuando recibes un mensaje de un cliente</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.newMessage}
                      onChange={() => toggleNotificationType("newMessage")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon ticket">
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
                        d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Nuevo Ticket</h4>
                    <p>Cuando se crea un nuevo ticket</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.newTicket}
                      onChange={() => toggleNotificationType("newTicket")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon assigned">
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
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Ticket Asignado</h4>
                    <p>Cuando te asignan un ticket</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.ticketAssigned}
                      onChange={() => toggleNotificationType("ticketAssigned")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon success">
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
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Deal Ganado</h4>
                    <p>Cuando cierras una venta exitosamente</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.dealWon}
                      onChange={() => toggleNotificationType("dealWon")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon error">
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Deal Perdido</h4>
                    <p>Cuando se pierde una oportunidad</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.dealLost}
                      onChange={() => toggleNotificationType("dealLost")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon call">
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
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Llamada Entrante</h4>
                    <p>Cuando recibes una llamada</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.callIncoming}
                      onChange={() => toggleNotificationType("callIncoming")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="notification-item">
                  <div className="notification-icon warning">
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
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div className="notification-info">
                    <h4>Alertas del Sistema</h4>
                    <p>Notificaciones importantes del sistema</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notificationTypes.systemAlert}
                      onChange={() => toggleNotificationType("systemAlert")}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="sound-settings-footer">
        <button className="btn-secondary" onClick={resetToDefaults}>
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Restaurar Valores Predeterminados
        </button>
        <div className="footer-info">
          <svg
            className="w-4 h-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Cambios guardados automticamente</span>
        </div>
      </div>
    </div>
  );
};

export default SoundSettings;
