import winston from "winston";

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

// Custom Format to Mask Sensitive Data
const sensitiveDataFilter = winston.format((info) => {
  const sensitiveKeys = [
    /pass/i,
    /token/i,
    /secret/i,
    /key/i,
    /auth/i,
    /credit/i,
    /card/i,
    /email/i,
    /phone/i,
  ];

  const mask = (obj: any) => {
    if (!obj || typeof obj !== "object") return obj;

    // Handle array
    if (Array.isArray(obj)) return obj.map(mask);

    const maskedObj = { ...obj };
    for (const key in maskedObj) {
      if (sensitiveKeys.some((regex) => regex.test(key))) {
        maskedObj[key] = "***REDACTED***";
      } else if (typeof maskedObj[key] === "object") {
        maskedObj[key] = mask(maskedObj[key]);
      }
    }
    return maskedObj;
  };

  // Mask message if it's an object, or metadata
  if (info.message && typeof info.message === "object") {
    info.message = mask(info.message);
  }
  // Also mask metadata fields
  return mask(info);
});

const transports = [
  // Console transport for Development
  new winston.transports.Console({
    format: winston.format.combine(
      sensitiveDataFilter(), // Apply masking
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        // Si el log incluye un stack trace, lo imprimimos. De lo contrario, solo el mensaje.
        (info) => {
          const message =
            typeof info.message === "object"
              ? JSON.stringify(info.message)
              : info.message;
          return `${info.timestamp} ${info.level}: ${info.stack || message}`;
        }
      )
    ),
  }),
  // File transport for Production (Simulated here, usually /var/log/...)
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
    format: winston.format.combine(
      sensitiveDataFilter(), // Apply masking
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  new winston.transports.File({
    filename: "logs/combined.log",
    format: winston.format.combine(
      sensitiveDataFilter(), // Apply masking
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

export const Logger = winston.createLogger({
  level: process.env.NODE_ENV === "development" ? "debug" : "warn",
  levels,
  transports,
});
