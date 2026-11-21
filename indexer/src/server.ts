import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { getPollerHealth } from './poller';
import { isLive, isReady, getReadinessDetails, getHealthResponse } from './health';
import { getMetricsPrometheusFormat } from './metrics';
import { logger } from './logger';

const app = express();

app.use(cors());
app.use(express.json());

// ── Request ID Injection for Tracing (#1134) ─────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      request_id?: string;
      log?: typeof logger;
    }
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

  req.request_id = requestId;
  res.setHeader('x-request-id', requestId);

  // Child logger bound to request_id so every log line carries it.
  req.log = logger.child({ request_id: requestId });

  const start = Date.now();
  res.on('finish', () => {
    req.log?.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      },
      'http request completed',
    );
  });

  next();
});
=======

// ── In-Flight Request Tracking & Graceful Shutdown (#698) ────────────────────

let activeRequestsCount = 0;
let isShuttingDown = false;

export const serverMetrics = {
  indexer_graceful_shutdown_duration_seconds: 0,
};

export function getActiveRequestsCount(): number {
  return activeRequestsCount;
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Server is shutting down' });
    return;
  }

  activeRequestsCount++;
  const decrement = () => {
    activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    res.removeListener('finish', decrement);
    res.removeListener('close', decrement);
  };

  res.on('finish', decrement);
  res.on('close', decrement);
  next();
});

/**
 * Gracefully shuts down the HTTP server by waiting for in-flight requests and event batches to complete.
 * Waits up to timeoutMs (default 10s).
 */
export async function gracefulShutdown(
  httpServer?: Server,
  timeoutMs = 10000,
): Promise<{ abortedRequests: number; durationSeconds: number }> {
  isShuttingDown = true;
  const startTime = Date.now();
  let abortedRequests = 0;

  logger.info(
    { timeout_ms: timeoutMs },
    'graceful shutdown beginning; stopping new tasks',
  );

  // Stop accepting new poll tasks on SIGTERM
  try {
    const { pollerHealth } = await import('./poller');
    pollerHealth.isRunning = false;
  } catch {}

  if (httpServer) {
    httpServer.close();
  }

  // Close WebSocket server
  try {
    const { getWebSocketServer } = await import('./ws');
    const wss = getWebSocketServer?.();
    wss?.close();
  } catch {}

  const deadline = Date.now() + timeoutMs;
  while (activeRequestsCount > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Close DB pool
  try {
    const { closeDb } = await import('./db');
    closeDb?.();
  } catch {}

  if (activeRequestsCount > 0) {
    abortedRequests = activeRequestsCount;
    logger.warn(
      { aborted_requests: abortedRequests },
      'forced shutdown after timeout with aborted requests',
    );
  } else {
    logger.info('all in-flight requests and batches drained cleanly');
  }

  const durationSeconds = (Date.now() - startTime) / 1000;
  serverMetrics.indexer_graceful_shutdown_duration_seconds = durationSeconds;
  logger.info(
    { duration_seconds: Number(durationSeconds.toFixed(2)) },
    'clean shutdown completed',
  );

  return { abortedRequests, durationSeconds };
}

// ── Health Probes ─────────────────────────────────────────────────────────────

app.get('/healthz/live', (req: Request, res: Response) => {
  try {
    const live = isLive();
    const statusCode = live ? 200 : 503;
    
    res.status(statusCode).json({
      status: live ? 'alive' : 'dead',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log?.error({ err }, 'liveness probe failed');
    res.status(500).json({ 
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/healthz/ready', (req: Request, res: Response) => {
  try {
    const ready = isReady();
    const details = getReadinessDetails();
    const statusCode = ready ? 200 : 503;
    
    res.status(statusCode).json({
      status: ready ? 'ready' : 'not_ready',
      ready,
      ledger_lag: details.ledger_lag,
      last_processed_ledger: details.last_processed_ledger,
      latest_network_ledger: details.latest_network_ledger,
      lastLedger: details.lastLedger,
      cursorAge: details.cursorAge,
      maxCursorAge: details.maxCursorAge,
      reasons: details.reasons,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    req.log?.error({ err }, 'readiness probe failed');
    res.status(503).json({ 
      status: 'error',
      ready: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Unified health endpoint (Issue #695)
 * Returns { status, ledger_lag, last_processed_ledger, latest_network_ledger }
 * alongside detailed poller health metrics.
 */
app.get('/health', (req: Request, res: Response) => {
  try {
    const health = getPollerHealth();
    const ready = isReady();
    const healthSummary = getHealthResponse();
    
    const statusCode = healthSummary.status === 'unhealthy' ? 503 : 200;
    
    res.status(statusCode).json({
      success: statusCode === 200,
      status: healthSummary.status,
      ledger_lag: healthSummary.ledger_lag,
      ledger_lag_seconds: healthSummary.ledger_lag_seconds,
      last_processed_ledger: healthSummary.last_processed_ledger,
      latest_network_ledger: healthSummary.latest_network_ledger,
      ready: healthSummary.status !== 'unhealthy',
      poller: {
        isRunning: health.isRunning,
        consecutiveFailures: health.consecutiveFailures,
        lastError: health.lastError,
        lastErrorAt: health.lastErrorAt,
        lastSuccessfulPollAt: health.lastSuccessfulPollAt,
        eventsProcessed: health.eventsProcessed,
        reorgsDetected: health.reorgsDetected,
        lastReorgAt: health.lastReorgAt,
        ledgerGapsDetected: health.ledgerGapsDetected,
        lastLedgerGapAt: health.lastLedgerGapAt,
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, 'health check failed');
    res.status(500).json({ 
      success: false, 
      status: 'error',
      error: err.message 
    });
  }
});

export default app;
