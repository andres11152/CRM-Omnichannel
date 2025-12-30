import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/AppError";
import { Logger } from "@/utils/logger";
import { Prisma } from "@prisma/client";

const sendErrorDev = (err: AppError, res: Response) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err: AppError, res: Response) => {
  // Errores operacionales que confiamos y queremos enviar al cliente
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }
  // Errores de programación o desconocidos: no filtrar detalles
  Logger.error("ERROR 💥", err);
  res.status(500).json({ status: "error", message: "Algo salió muy mal." });
};

const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError) => {
  // P2025: Record to delete does not exist.
  // P2025: Record to delete does not exist.
  if (err.code === "P2025") {
    return new AppError(`Recurso no encontrado.`, 404);
  }

  // P2002: Unique constraint violation
  if (err.code === "P2002") {
    const target = (err.meta?.target as string[]) || "campo";
    return new AppError(
      `El valor de '${target}' ya está en uso. Por favor elija otro.`,
      400
    );
  }

  // P2003: Foreign key constraint violation
  if (err.code === "P2003") {
    return new AppError(
      `Operación inválida: registro relacionado no encontrado o impedimento de integridad.`,
      400
    );
  }

  // Log the real detailed error internally
  Logger.error(`[Prisma Error ${err.code}]`, err);

  // Return a generic error to the client
  return new AppError("Error interno de base de datos.", 500);
};

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error: AppError;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  } else if (err instanceof AppError) {
    error = err;
  } else {
    // 🛡️ SENIOR SAFETY: Handle cases where the error is not an instance of Error or AppError
    const message =
      err?.message || (typeof err === "string" ? err : "Algo salió muy mal.");
    const statusCode = err?.statusCode || 500;

    error = new AppError(message, statusCode);
    error.stack = err?.stack || new Error().stack;
  }

  // Silence operational errors (4xx) from spamming the logs
  if (!error.isOperational || error.statusCode >= 500) {
    Logger.error("[GLOBAL ERROR HANDLER] 💥", err);
  }

  process.env.NODE_ENV === "development"
    ? sendErrorDev(error, res)
    : sendErrorProd(error, res);
};
