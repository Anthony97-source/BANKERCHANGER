import pino from 'pino';
import { requestContext } from './requestContext';

const VALID_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

type LogLevel = (typeof VALID_LEVELS)[number];

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase().trim();
  if ((VALID_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  return 'info';
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Pino logger.
 *
 * - Always emits structured JSON (production-safe). Pretty printing is only
 *   enabled when explicitly opted-in via LOG_PRETTY=true in a non-production
 *   environment, so production output is never polluted with non-JSON lines.
 * - Level is configurable via the LOG_LEVEL env var (safe fallback to "info").
 * - A mixin injects `request_id` from the AsyncLocalStorage request context so
 *   every log line is traceable back to the originating request.
 */
export const logger = pino({
  level: resolveLevel(),
  base: {
    service: process.env.SERVICE_NAME ?? 'backend',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const store = requestContext.getStore();
    const requestId = store?.requestId;
    return requestId ? { request_id: requestId } : {};
  },
  ...(isDev &&
    process.env.LOG_PRETTY === 'true' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }),
});

export type Logger = pino.Logger;

/**
 * Create a request-scoped child logger. Any additional bindings provided are
 * merged into every log line emitted by the returned logger. The request_id
 * is still injected automatically via the root logger mixin.
 */
export function createRequestLogger(
  bindings: Record<string, unknown> = {},
): Logger {
  const store = requestContext.getStore();
  const requestId = store?.requestId;
  return logger.child({
    ...(requestId ? { request_id: requestId } : {}),
    ...bindings,
  });
}

export default logger;