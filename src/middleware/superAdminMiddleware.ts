
import { RequestHandler, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/types/types';
import { AppError } from '@/utils/AppError';

/**
 * SUPER ADMIN GUARD MIDDLEWARE
 * This guard ensures that only a user with the 'master' role can access the route.
 */
export const superAdminGuard: RequestHandler = (req, res, next) => {
  // Cast to AuthenticatedRequest internally so function matches Express handlers
  const authReq = req as AuthenticatedRequest;
  // We assume authentication middleware has already populated authReq.user
  if (authReq.user?.role !== 'MASTER') {
    return next(new AppError('Acceso Denegado: Esta acción requiere privilegios de Super Administrador.', 403));
  }

  console.log(`[SuperAdminGuard] 🛡️ Access granted for Master user: ${authReq.user?.email}`);
  next();
};
