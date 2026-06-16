import express from "express";
import cookieParser from "cookie-parser";
import {
  requestTimeout,
  slowRequestLogger,
} from "@/middleware/timeoutMiddleware";
// Trigger restart
import { httpLogger } from "@/middleware/httpLogger";
import { handleImpersonation } from "@/middleware/impersonationMiddleware";
import { metricsMiddleware } from "@/utils/metrics";
import { securityMiddleware } from "@/middleware/securityMiddleware";
import { globalErrorHandler } from "@/middleware/errorMiddleware";
import { AppError } from "@/utils/AppError";
import router from "@/routes"; // Unified Router

export const createApp = (): express.Application => {
  const app = express();

  // 1. Trust Proxy (for load balancers)
  app.set("trust proxy", 1);

  // 2. Security Headers & Parsing
  securityMiddleware(app);
  app.use(cookieParser()); //  Enterprise: Parse HttpOnly cookies
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // 3. Static Files (S3 handles uploads)

  // 4. Observability & Monitoring
  app.use(requestTimeout({ timeout: 30000 })); // 30s timeout protection
  app.use(slowRequestLogger(2000)); // Log slow requests >2s
  app.use(httpLogger); // Structured logs
  app.use(metricsMiddleware); // Prometheus metrics

  // 5. Auth & Context
  app.use(handleImpersonation);

  // 6. Routes (Unified)
  app.use(router);

  // 7. 404 Handler
  app.use((req, res, next) => {
    next(
      new AppError(
        `No se encontró la ruta '${req.originalUrl}' en este servidor`,
        404,
      ),
    );
  });

  // 8. Global Error Handler
  app.use(globalErrorHandler);

  return app;
};
