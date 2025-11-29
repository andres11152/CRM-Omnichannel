
import winston from 'winston';

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const transports = [
  // Console transport for Development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        // Si el log incluye un stack trace, lo imprimimos. De lo contrario, solo el mensaje.
        (info) =>
          `${info.timestamp} ${info.level}: ${info.stack || info.message}`
      )
    ),
  }),
  // File transport for Production (Simulated here, usually /var/log/...)
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

export const Logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
  levels,
  transports,
});
