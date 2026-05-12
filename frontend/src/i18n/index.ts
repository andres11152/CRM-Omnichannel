import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import esTranslations from "./locales/es.json";
import enTranslations from "./locales/en.json";

i18n
  // Detects user language
  .use(LanguageDetector)
  // Passes i18n down to react-i18next
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: esTranslations },
      en: { translation: enTranslations },
    },
    fallbackLng: "es", // Default to Spanish if browser lang is unknown
    supportedLngs: ["es", "en"],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Order of language detection
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
