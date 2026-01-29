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
        preferences?: any;
        phone?: string;
        about?: string;
        profilePicUrl?: string;
      };
      file?: any;
      files?: any;
    }
  }
}

export {}; // Make this a module
