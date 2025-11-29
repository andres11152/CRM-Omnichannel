import { Express, Request, Response, NextFunction } from "express";
import cors from "cors"; // Import the cors package

/**
 * SECURITY MIDDLEWARE
 * Sets up basic security headers (Helmet-like) and CORS.
 */
export const securityMiddleware = (app: Express) => {
  // Define allowed origins from environment variable or default to localhost for development
  // It's good practice to use an environment variable for production origins
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:5173", "http://localhost:5174"];

  // Configure CORS middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      },
      credentials: true, // Allow cookies to be sent
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
      ],
    })
  );
};
