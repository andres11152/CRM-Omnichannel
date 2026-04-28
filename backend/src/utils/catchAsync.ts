import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps async route handlers to catch errors automatically.
 * Eliminates repetitive try-catch blocks in controllers.
 */
export const catchAsync = <TReq = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<unknown> | void
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as unknown as TReq, res, next)).catch(next);
  };
};
