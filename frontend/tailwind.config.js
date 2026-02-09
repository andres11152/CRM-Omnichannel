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
          green: {
            DEFAULT: "#007B65", // Light Mode Primary
            dark: "#1ABC9C", // Dark Mode Primary
          },
          blue: {
            DEFAULT: "#0047AB", // Light Mode Secondary
            dark: "#4A90E2", // Dark Mode Secondary
          },
          accent: {
            DEFAULT: "#7FFF00", // Vibrant Accent
          },
          bg: {
            DEFAULT: "#F8F8F8", // Light Background
            dark: "#121212", // Dark Background
          },
          panel: {
            DEFAULT: "#FFFFFF", // Light Card/Panel
            dark: "#1E1E1E", // Dark Card/Panel
          },
          text: {
            DEFAULT: "#212121", // Light Text
            dark: "#E0E0E0", // Dark Text
          },
          border: {
            DEFAULT: "#E0E0E0",
            dark: "#333333",
          },
          error: {
            DEFAULT: "#D32F2F",
            dark: "#EF5350",
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
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "fade-in-up": "fadeInUp 0.6s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulseSlow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow-line": "flowAnimation 1s linear infinite",
      },
    },
  },
  plugins: [],
};
