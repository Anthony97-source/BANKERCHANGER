import express from 'express';
import request from 'supertest';
import { rpc } from '@stellar/stellar-sdk';
import { pool } from '../../src/config/db';
import { redis } from '../../src/config/redis';
import healthRouter from '../../src/routes/health.routes';

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { ping: jest.fn() },
}));

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn(),
    })),
  },
}));

const app = express().use('/api', healthRouter);
const mockQuery = pool.query as jest.Mock;
const mockPing = redis.ping as jest.Mock;
const mockGetLatestLedger = (
  (rpc.Server as unknown as jest.Mock).mock.results[0].value as {
    getLatestLedger: jest.Mock;
  }
).getLatestLedger;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation((query: string) => Promise.resolve({
    rows: query.includes('indexer_checkpoints')
      ? [{ last_processed_ledger: '100' }]
      : [],
  }));
  mockPing.mockResolvedValue('PONG');
  mockGetLatestLedger.mockResolvedValue({ sequence: 100 });
});

describe('GET /api/health', () => {
  it('reports healthy checks, uptime, version, and disables caching', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.checks).toEqual({
      db: 'healthy',
      redis: 'healthy',
      indexer: {
        status: 'healthy',
        last_processed_ledger: 100,
        stellar_tip_ledger: 100,
        lag_ledgers: 0,
      },
    });
    expect(response.body.uptime_seconds).toEqual(expect.any(Number));
    expect(response.body.version).toEqual(expect.any(String));
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports indexer lag as degraded while remaining available', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 103 });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.indexer.lag_ledgers).toBe(3);
  });

  it('returns 503 when database connectivity fails', async () => {
    mockQuery.mockRejectedValue(new Error('database unavailable'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 when Redis connectivity fails', async () => {
    mockPing.mockRejectedValue(new Error('Redis unavailable'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.checks.redis).toBe('unhealthy');
  });
});
