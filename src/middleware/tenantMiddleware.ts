
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

/**
 * TENANT & AUTH MIDDLEWARE (SIMULATED)
 * This middleware decodes a mock token to identify the user and their company scope.
 */
export const companyContextMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('No token provided', 401));
    }

    const token = authHeader.split(' ')[1];
    let mockDecodedUser: any;

    // --- MOCK DECODING LOGIC ---
    if (token === 'master_token') {
      // This is the Super Admin
      mockDecodedUser = {
        id: 'u_master_001',
        email: 'superadmin@reply.com',
        role: 'master',
        // Master role has no companyId, it's global
      };
      req.user = mockDecodedUser;
      console.log(`[AuthMiddleware] 🛡️ Global access granted for Master user: ${req.user?.email}`);

    } else if (token === 'company_admin_token') {
      // This is a standard Company Admin
      mockDecodedUser = {
        id: 'u_123',
        email: 'admin@acme.com',
        role: 'company_admin',
        companyId: 'comp_123' // CRITICAL: The Tenant ID
      };
      req.user = mockDecodedUser;
      req.companyId = mockDecodedUser.companyId;
      console.log(`[AuthMiddleware] 🛡️ Request scoped to Company: ${req.companyId} for user ${req.user?.email}`);

    } else if (token === 'agent_token') {
        // This is a Standard Agent (Limited access)
        mockDecodedUser = {
            id: 'u_agent_001',
            email: 'agent@acme.com',
            role: 'agent',
            companyId: 'comp_123'
        };
        req.user = mockDecodedUser;
        req.companyId = mockDecodedUser.companyId;
        console.log(`[AuthMiddleware] 👤 Agent access for: ${req.user?.email}`);
    } else {
      return next(new AppError('Invalid Token', 403));
    }
    
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Auth Failed', error);
    return next(new AppError('Invalid Token', 403));
  }
};
