import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError) => {
  // P2025: Record to delete does not exist.
  if (err.code === "P2025") {
    return new AppError(`Recurso no encontrado.`, 404);
  }

  // P2002: Unique constraint violation
  if (err.code === "P2002") {
    const target = (err.meta?.target as string[]) || "campo";
    return new AppError(
      `El valor de '${target}' ya está en uso. Por favor elija otro.`,
      400,
    );
  }

  // P2003: Foreign key constraint violation
  if (err.code === "P2003") {
    return new AppError(
      `Operación inválida: registro relacionado no encontrado o impedimento de integridad.`,
      400,
    );
  }

  // Log the real detailed error internally
  Logger.error(`[Prisma Error ${err.code}]`, err);

  // Return a generic error to the client
  return new AppError("Error interno de base de datos.", 500);
};

const handleJWTError = () =>
  new AppError("Token inválido. Por favor inicie sesión nuevamente.", 401);

const handleJWTExpiredError = () =>
  new AppError(
    "Su token ha expirado. Por favor inicie sesión nuevamente.",
    401,
  );

const sendErrorDev = (err: AppError, res: Response) => {
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    stack: err.stack,
    error: err,
  });
};

const sendErrorProd = (err: AppError, res: Response) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
    });
  }

  // Programming or other unknown error: don't leak error details
  Logger.error("ERROR 💥", err);

  res.status(500).json({
    success: false,
    status: "error",
    message: "Algo salió muy mal intentando procesar su solicitud.",
  });
};

export interface CustomError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: string;
  meta?: Record<string, unknown>;
}

export const globalErrorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  let error = err;

  // Si es error de Prisma, lo transformamos inmediato
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  }
  // Si es JWT
  if (err.name === "JsonWebTokenError") error = handleJWTError();
  if (err.name === "TokenExpiredError") error = handleJWTExpiredError();

  // Asegurar que error sea instancia de AppError si no lo es ya
  if (!(error instanceof AppError)) {
    const message = error.message || "Algo salió muy mal.";
    const statusCode = error.statusCode || 500;
    error = new AppError(message, statusCode);
    error.stack = err.stack;
  }

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(error as AppError, res);
  } else {
    sendErrorProd(error as AppError, res);
  }
};
