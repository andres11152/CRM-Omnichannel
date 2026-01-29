import { Response } from "express";

/**
 * Standardized success response structure.
 * { success: true, status: "success", data: ... }
 */
export const sendResponse = (
  res: Response,
  statusCode: number,
  data: any,
  message?: string,
) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};
