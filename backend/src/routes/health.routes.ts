import { Router, Request, Response } from 'express';
import { rpc } from '@stellar/stellar-sdk';
import { pool } from '../config/db';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { version } from '../../package.json';

type CheckStatus = 'healthy' | 'degraded' | 'unhealthy';

interface IndexerCheck {
  status: CheckStatus;
  last_processed_ledger: number | null;
  stellar_tip_ledger: number | null;
  lag_ledgers: number | null;
  error?: string;
}

const router = Router();
const stellarRpc = new rpc.Server(
  process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
);

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await pool.query('SELECT 1');
    return 'healthy';
  } catch (err) {
    logger.error({ err }, 'Health check: database connectivity failed');
    return 'unhealthy';
  }
}

async function checkRedis(): Promise<CheckStatus> {
  try {
    await redis.ping();
    return 'healthy';
  } catch (err) {
    logger.error({ err }, 'Health check: Redis connectivity failed');
    return 'unhealthy';
  }
}

async function checkIndexer(): Promise<IndexerCheck> {
  try {
    const [checkpointResult, latestLedger] = await Promise.all([
      pool.query(
        'SELECT last_processed_ledger FROM indexer_checkpoints ORDER BY id DESC LIMIT 1',
      ),
      stellarRpc.getLatestLedger(),
    ]);

    const checkpoint = checkpointResult.rows[0];
    if (!checkpoint) {
      return {
        status: 'unhealthy',
        last_processed_ledger: null,
        stellar_tip_ledger: latestLedger.sequence,
        lag_ledgers: null,
        error: 'checkpoint_missing',
      };
    }

    const lastProcessedLedger = Number(checkpoint.last_processed_ledger);
    const stellarTipLedger = Number(latestLedger.sequence);
    if (!Number.isFinite(lastProcessedLedger) || !Number.isFinite(stellarTipLedger)) {
      throw new Error('Invalid ledger sequence returned by checkpoint or Stellar RPC');
    }

    const lag = Math.max(0, stellarTipLedger - lastProcessedLedger);
    return {
      status: lag > 0 ? 'degraded' : 'healthy',
      last_processed_ledger: lastProcessedLedger,
      stellar_tip_ledger: stellarTipLedger,
      lag_ledgers: lag,
    };
  } catch (err) {
    logger.error({ err }, 'Health check: indexer checkpoint or Stellar RPC check failed');
    return {
      status: 'unhealthy',
      last_processed_ledger: null,
      stellar_tip_ledger: null,
      lag_ledgers: null,
      error: 'indexer_check_failed',
    };
  }
}

async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const [db, redisStatus, indexer] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkIndexer(),
  ]);
  const statuses = [db, redisStatus, indexer.status];
  const status: CheckStatus = statuses.includes('unhealthy')
    ? 'unhealthy'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

  res.status(status === 'unhealthy' ? 503 : 200).json({
    status,
    checks: {
      db,
      redis: redisStatus,
      indexer,
    },
    uptime_seconds: Math.floor(process.uptime()),
    version,
  });
}

router.get('/health', healthCheck);

export default router;
