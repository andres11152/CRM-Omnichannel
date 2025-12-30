// Express type augmentation for production builds
import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        name?: string | null;
        role?: string;
        companyId?: string;
      };
      companyId?: string;
    }
  }
}

export {};
