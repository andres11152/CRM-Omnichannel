/**
 * 📁 MEDIA CATEGORIES
 *
 * Centralized category definitions for media files.
 * This ensures consistency across the entire application.
 *
 * "100-year" solution: Type-safe enums with clear documentation.
 */

/**
 * Media categories determine WHERE and HOW files are displayed/used.
 */
export const MediaCategory = {
  /**
   * Files uploaded directly to the Media Library.
   * Visible in: Library, Chat selector, Workflow builder
   */
  MEDIA_LIBRARY: "media-library",

  /**
   * Voice notes from WhatsApp/chat conversations.
   * Visible in: Only within the specific conversation
   * NOT visible in: Library, Workflow builder
   */
  VOICE_NOTES: "voice-notes",

  /**
   * Files specifically for workflow automation.
   * Visible in: Library, Workflow builder
   */
  WORKFLOWS: "workflows",

  /**
   * Knowledge base documents for AI/RAG.
   * Visible in: AI Settings, Library (filtered)
   */
  KNOWLEDGE_BASE: "knowledge-base",

  /**
   * Profile pictures and avatars.
   * Visible in: Only user profile settings
   */
  AVATARS: "avatars",

  /**
   * Chat attachments (images, files sent in conversation).
   * Visible in: Only within the specific conversation
   */
  CHAT_ATTACHMENTS: "chat-attachments",
} as const;

/**
 * Type for MediaCategory values
 */
export type MediaCategoryType =
  (typeof MediaCategory)[keyof typeof MediaCategory];

/**
 * Categories that should appear in the Media Library
 */
export const LIBRARY_VISIBLE_CATEGORIES: MediaCategoryType[] = [
  MediaCategory.MEDIA_LIBRARY,
  MediaCategory.WORKFLOWS,
  MediaCategory.KNOWLEDGE_BASE,
];

/**
 * Categories that should appear in chat media selector
 */
export const CHAT_SELECTOR_CATEGORIES: MediaCategoryType[] = [
  MediaCategory.MEDIA_LIBRARY,
  MediaCategory.WORKFLOWS,
];

/**
 * Categories that should appear in workflow builder
 */
export const WORKFLOW_SELECTOR_CATEGORIES: MediaCategoryType[] = [
  MediaCategory.MEDIA_LIBRARY,
  MediaCategory.WORKFLOWS,
];

/**
 * Human-readable labels for categories (for UI)
 */
export const CATEGORY_LABELS: Record<MediaCategoryType, string> = {
  [MediaCategory.MEDIA_LIBRARY]: "Biblioteca",
  [MediaCategory.VOICE_NOTES]: "Notas de Voz",
  [MediaCategory.WORKFLOWS]: "Workflows",
  [MediaCategory.KNOWLEDGE_BASE]: "Base de Conocimiento",
  [MediaCategory.AVATARS]: "Avatares",
  [MediaCategory.CHAT_ATTACHMENTS]: "Adjuntos de Chat",
};

/**
 * Validate if a string is a valid MediaCategory
 */
export const isValidCategory = (
  category: string,
): category is MediaCategoryType => {
  return Object.values(MediaCategory).includes(category as MediaCategoryType);
};
