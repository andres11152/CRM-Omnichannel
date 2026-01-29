import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps async route handlers to catch errors automatically.
 * Eliminates repetitive try-catch blocks in controllers.
 */
export const catchAsync = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
