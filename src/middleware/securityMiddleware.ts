import { Express, Request, Response, NextFunction } from "express";
import cors from "cors"; // Import the cors package

/**
 * SECURITY MIDDLEWARE
 * Sets up basic security headers (Helmet-like) and CORS.
 */
export const securityMiddleware = (app: Express) => {
  // Define allowed origins from environment variable or default to localhost for development
  // It's good practice to use an environment variable for production origins
  const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://reply.software",
    "https://www.reply.software",
  ];

  const envOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [];

  if (process.env.FRONTEND_URL) {
    // Remove trailing slash if present
    const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
    envOrigins.push(frontendUrl);
  }

  // Use a Set to automatically handle duplicates from default and env sources
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  console.log("[CORS] Allowed origins:", allowedOrigins);

  // Configure CORS middleware
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // For production, you should block requests from unknown origins
        if (process.env.NODE_ENV === "production") {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        } else {
          callback(null, true); // Allow in development for easier testing
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  };

  // Configure CORS middleware
  app.use(cors(corsOptions));
};
