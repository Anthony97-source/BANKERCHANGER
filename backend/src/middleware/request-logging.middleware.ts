import type { Request, Response, NextFunction } from 'express';
import { requestContext } from '../utils/requestContext';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { httpRequestDuration, httpRequestsTotal } from '../services/metrics.service';

const SENSITIVE_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/api/oracle/submit',
  '/api/admin',
];

/**
 * Request logging middleware with structured format.
 * Development: human-readable format
 * Production: JSON format for log aggregation
 * Masks request body for sensitive paths and redacts Authorization header
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.path;

  // Record HTTP metrics on response finish
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const route = req.route?.path || req.path;
    const statusCode = String(res.statusCode);
    httpRequestDuration.observe({ method, route, status_code: statusCode }, durationMs);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
  });

  // Capture response end to log status and response time
  const originalSend = res.send;
  res.send = function (data: unknown) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    const isSensitive = SENSITIVE_PATHS.some((p) => path.startsWith(p));
    const body = isSensitive ? '[REDACTED]' : JSON.stringify(req.body);

    // Redact Authorization header to prevent token leakage
    const authHeader = req.get('authorization');
    const displayAuthHeader = authHeader ? 'Bearer [REDACTED]' : undefined;

    const logData = {
      method,
      path,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip,
      ...(isSensitive && { body }),
      ...(displayAuthHeader && { authorization: displayAuthHeader }),
    };

    if (process.env.NODE_ENV === 'production') {
      logger.info(logData, `${method} ${path} ${statusCode}`);
    } else {
      logger.info(logData, `${method} ${path} ${statusCode} (${responseTime}ms)`);
    }

    return originalSend.call(this, data);
  };

  requestContext.run({ requestId: String(req.id ?? randomUUID()) }, next);
}
