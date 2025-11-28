import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/AppError';
import { Logger } from '@/utils/logger';
import { Prisma } from '@prisma/client';

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
  Logger.error('ERROR 💥', err);
  res.status(500).json({ status: 'error', message: 'Algo salió muy mal.' });
};

const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError) => {
  // P2025: Record to delete does not exist.
  if (err.code === 'P2025') {
    return new AppError(`Recurso no encontrado. ${err.meta?.cause || ''}`, 404);
  }
  // Añade aquí otros códigos de error de Prisma que quieras manejar.
  return new AppError('Error inesperado en la base de datos.', 500);
};

export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let error: AppError;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  } else if (err instanceof AppError) {
    error = err;
  } else {
    error = new AppError(err.message || 'Algo salió muy mal.', err.statusCode || 500);
    error.stack = err.stack;
  }

  process.env.NODE_ENV === 'development' ? sendErrorDev(error, res) : sendErrorProd(error, res);
};