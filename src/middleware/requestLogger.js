/**
 * Request/Response Logger Middleware
 * Logs details about incoming requests and outgoing responses using the shared logger utility
 */

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { requestContext } from '../utils/logger.js';

// Format bytes to human readable
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Sanitize sensitive data from logs
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;

  const sensitiveFields = ['password', 'token', 'authorization', 'secret', 'apiKey'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
};

// Truncate long strings for logging
const truncate = (str, maxLength = 500) => {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '... [truncated]';
};

/**
 * Request Logger Middleware
 * @param {Object} options - Configuration options
 * @param {boolean} options.logBody - Whether to log request/response bodies (default: true)
 * @param {boolean} options.logHeaders - Whether to log request headers (default: false)
 * @param {boolean} options.logQuery - Whether to log query params (default: true)
 * @param {string[]} options.skipPaths - Paths to skip logging (default: ['/health'])
 */
const requestLogger = (options = {}) => {
  const {
    logBody = true,
    logHeaders = false,
    logQuery = true,
    skipPaths = ['/health'],
  } = options;

  return (req, res, next) => {
    // Skip logging for certain paths
    if (skipPaths.some((path) => req.path.includes(path))) {
      return next();
    }

    const startTime = Date.now();
    // Full UUID requestId for uniqueness and full display in logs
    const requestId = crypto.randomUUID();

    // Attach requestId to request and run in context so logger includes it automatically
    req.requestId = requestId;

    const runWithContext = () => {
      // Capture original response methods
      const originalSend = res.send;
      const originalJson = res.json;
      let responseBody;

      // Override res.send
      res.send = function (body) {
        responseBody = body;
        return originalSend.call(this, body);
      };

      // Override res.json
      res.json = function (body) {
        responseBody = body;
        return originalJson.call(this, body);
      };

      // Log request
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      logger.info('→ REQUEST', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        ip,
        userAgent: truncate(userAgent, 80),
      });

      if (req.user) {
        logger.info('  User', { requestId, user: req.user.email || req.user.id });
      }

      if (logQuery && Object.keys(req.query).length > 0) {
        logger.info('  Query', { requestId, query: req.query });
      }

      if (logBody && req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = sanitizeBody(req.body);
        logger.info('  Body', {
          requestId,
          body: truncate(JSON.stringify(sanitizedBody), 300),
        });
      }

      if (logHeaders) {
        const headers = { ...req.headers };
        if (headers.authorization) headers.authorization = '[REDACTED]';
        logger.info('  Headers', { requestId, headers });
      }

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - startTime;

        logger.info('← RESPONSE', {
          requestId,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        });

        if (logBody && responseBody) {
          try {
            const body =
              typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;

            if (res.statusCode >= 400 || (body && JSON.stringify(body).length < 500)) {
              logger.info('  Response', {
                requestId,
                response: truncate(JSON.stringify(body), 300),
              });
            } else {
              const size = JSON.stringify(body).length;
              logger.info('  Response size', { requestId, size: formatBytes(size) });
            }
          } catch (e) {
            if (typeof responseBody === 'string' && responseBody.length < 200) {
              logger.info('  Response', { requestId, response: responseBody });
            }
          }
        }
      });

      next();
    };

    requestContext.run({ requestId }, runWithContext);
  };
};

export default requestLogger;
