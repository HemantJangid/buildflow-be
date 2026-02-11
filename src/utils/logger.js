import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

const { combine, timestamp, printf } = winston.format;

// Request context - stores requestId for the current request
export const requestContext = new AsyncLocalStorage();

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  // Level colors
  error: '\x1b[31m',   // red
  warn: '\x1b[33m',    // yellow
  info: '\x1b[32m',    // green
  http: '\x1b[35m',    // magenta
  debug: '\x1b[36m',   // cyan
  // Element colors
  datetime: '\x1b[90m',   // gray
  requestId: '\x1b[35m',  // magenta
  message: '\x1b[37m',    // white
  meta: '\x1b[90m',      // gray for extra meta
};

const levelColor = (level) => colors[level] || colors.reset;

// Format: [datetime:level] [requestId] - message [optional meta]
// requestId comes from meta (explicit) or from request context (AsyncLocalStorage)
const consoleFormat = printf(({ level, message, timestamp: ts, requestId: metaRequestId, ...meta }) => {
  const rest = { ...meta };
  delete rest.level;
  delete rest.message;
  delete rest.timestamp;
  // Use requestId from meta first, then from request context - always display full value
  const ctx = requestContext.getStore();
  const requestId = metaRequestId ?? ctx?.requestId ?? null;
  const metaStr = Object.keys(rest).length ? ` ${colors.meta}${JSON.stringify(rest)}${colors.reset}` : '';
  const requestIdStr = requestId != null ? ` ${colors.requestId}[${String(requestId)}]${colors.reset}` : '';
  return `${colors.datetime}[${ts}:${levelColor(level)}${level}${colors.reset}${colors.datetime}]${colors.reset}${requestIdStr} ${colors.message}- ${message}${colors.reset}${metaStr}`;
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat()
  ),
  defaultMeta: {},
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

export default logger;
