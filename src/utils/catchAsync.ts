
import { Request, Response, NextFunction } from 'express';

// Wraps an async function and automatically passes any error to NextFunction
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
