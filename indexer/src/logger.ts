import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Base Pino logger for the indexer.
 *
 * - JSON output in production (and by default), pretty output in development.
 * - Level configurable via LOG_LEVEL (defaults to 'info').
 * - ISO timestamps for consistent, parseable log lines.
 * - `level` emitted as a string label for easy aggregation/indexing.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty-print only in non-production environments for local development.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

/**
 * Context that can be attached to a child logger for tracing and correlation.
 */
export interface LogContext {
  /** Correlation id used to trace a request/operation across services. */
  request_id?: string;
  /** Ledger sequence number, when logging ledger-related work. */
  ledger?: number;
  /** Event identifier (e.g. contract event id or hash). */
  event_id?: string;
  /** Contract id, when logging contract event processing. */
  contract_id?: string;
  /** Any additional structured fields. */
  [key: string]: unknown;
}

/**
 * Create a child logger with attached context.
 *
 * Use this in indexer modules to attach ledger/event context so that all
 * downstream log lines carry the same correlation fields (e.g. request_id).
 *
 * @example
 *   const log = createChildLogger({ request_id, ledger: seq });
 *   log.info('processing event');
 */
export function createChildLogger(context: LogContext = {}): pino.Logger {
  return logger.child(context);
}

/**
 * Extract a request id from common header names, if present.
 * Useful when the indexer is invoked from an HTTP request context.
 */
export function getRequestId(
  headers?: Record<string, string | string[] | undefined>,
): string | undefined {
  if (!headers) return undefined;
  const raw =
    headers['x-request-id'] ??
    headers['x-correlation-id'] ??
    headers['request-id'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export default logger;