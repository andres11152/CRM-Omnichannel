import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        companyId: string;
        role: UserRole | string;
        email?: string;
        name?: string | null;
        preferences?: Record<string, unknown>;
        phone?: string;
        about?: string;
        profilePicUrl?: string;
        apiKeyId?: string;
        scopes?: string[];
      };
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
    }
  }
}

export {}; // Make this a module
