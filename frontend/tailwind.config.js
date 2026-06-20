/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        reply: {
          brand: {
            DEFAULT: "#00a884", // Pure Reply Emerald
            dark: "#005c4b", // Deep Emerald
            light: "#00e6b3", // Bright Emerald
          },
          green: {
            DEFAULT: "#00a884", // 🎯 Outbound Bubble Color (Reply Emerald)
            dark: "#005c4b", // Dark Mode Outbound Bubble
            light: "#00e6b3", // Accent / Hover
          },
          bg: {
            DEFAULT: "#F0F2F5", // Clean Light Gray
            dark: "#0b141a", // Master Dark Background
          },
          surface: {
            DEFAULT: "#FFFFFF",
            dark: "#111b21", // Sidebar/Secondary Surface
          },
          panel: {
            DEFAULT: "#FFFFFF",
            dark: "#202c33", // Cards/Modals/Bubbles
          },
          border: {
            DEFAULT: "#E9EDEF",
            dark: "#2a3942", // Professional Dark Border
          },
          text: {
            DEFAULT: "#111b21", // 🎯 Inbound text color (Light Mode)
            dark: "#e9edef", // 🎯 Inbound text color (Dark Mode)
            primary: {
              DEFAULT: "#111b21",
              dark: "#e9edef",
            },
            secondary: {
              DEFAULT: "#667781",
              dark: "#8696a0",
            },
          },
        },
        sentry: {
          brand: {
            DEFAULT: "#00a884", // Pure Sentry Emerald
            dark: "#005c4b", // Deep Emerald
            light: "#00e6b3", // Bright Emerald
          },
          green: {
            DEFAULT: "#00a884", // 🎯 Outbound Bubble Color (Sentry Emerald)
            dark: "#005c4b", // Dark Mode Outbound Bubble
            light: "#00e6b3", // Accent / Hover
          },
          bg: {
            DEFAULT: "#F0F2F5", // Clean Light Gray
            dark: "#0b141a", // Master Dark Background
          },
          surface: {
            DEFAULT: "#FFFFFF",
            dark: "#111b21", // Sidebar/Secondary Surface
          },
          panel: {
            DEFAULT: "#FFFFFF",
            dark: "#202c33", // Cards/Modals/Bubbles
          },
          border: {
            DEFAULT: "#E9EDEF",
            dark: "#2a3942", // Professional Dark Border
          },
          text: {
            DEFAULT: "#111b21", // 🎯 Inbound text color (Light Mode)
            dark: "#e9edef", // 🎯 Inbound text color (Dark Mode)
            primary: {
              DEFAULT: "#111b21",
              dark: "#e9edef",
            },
            secondary: {
              DEFAULT: "#667781",
              dark: "#8696a0",
            },
          },
        },
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": {
            opacity: "0",
            transform: "translateY(100%)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        modalIn: {
          "0%": { opacity: "0", transform: "scale(0.92) translateY(12px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "fade-in-up": "fadeInUp 0.6s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulseSlow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow-line": "flowAnimation 1s linear infinite",
        "modal-in": "modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      },
    },
  },
  plugins: [],
};
