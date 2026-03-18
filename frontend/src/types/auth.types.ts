import { BaseEntity } from "./common.types";

/**
 * 🔐 Auth & User Types
 */

export type UserRole =
  | "MASTER"
  | "ADMIN"
  | "AGENT"
  | "company_admin"
  | "master"
  | "agent";
// Note: Lowercase added for backward compatibility with existing frontend code.
// Should migrate to Uppercase to match Backend Enum.

export type CompanyStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "OVERDUE"
  | "CANCELED"
  | "BANNED"
  | "TRIAL";

export interface User extends BaseEntity {
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  avatarUrl?: string; // Optional
  avatar?: string; // Deprecated: alias for avatarUrl
  profilePicUrl?: string; // WhatsApp/Social Profile Pic
  about?: string; // Status/Bio
  phone?: string;
  companyStatus?: string; // Legacy/Token field
  isActive: boolean;

  // Preferences (JSON in DB)
  preferences?: UserPreferences;

  // Relations (Loaded optionally)
  company?: Company;
}

export interface UserPreferences {
  darkMode?: boolean;
  language?: string;
  notifications?: {
    email: boolean;
    browser: boolean;
  };
  sidebarOrder?: string[];
}

export interface Company extends BaseEntity {
  name: string;
  slug: string; // unique
  logoUrl?: string;
  status: CompanyStatus;
  plan: "FREE" | "PRO" | "ENTERPRISE";
  planId?: string; // Legacy/Relation support
  isActive: boolean;
  subscriptionEndsAt?: Date | string | null;
  settings?: Record<string, unknown>;
  users?: { email: string }[];
}

export interface LoginResponse {
  user: User;
  token: string;
}
