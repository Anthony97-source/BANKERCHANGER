import express from 'express';
import request from 'supertest';
import leaderboardRouter from '../../src/routes/leaderboard.routes';
import { pool } from '../../src/config/db';
import * as cache from '../../src/services/cache.service';
import { errorMiddleware } from '../../src/middleware/error.middleware';

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/services/cache.service', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

const app = express();
app.use('/api/leaderboard', leaderboardRouter);
app.use(errorMiddleware);

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cache.get as jest.Mock).mockResolvedValue(null);
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          bettor_address: 'G12345678901234567890123456789012345678901234567890123456',
          roi: '25.50',
          win_rate: '66.67',
          total_volume_xlm: '120.25',
          bets_count: 3,
        },
      ],
    });
  });

  it('defaults to the top 100 by ROI and caches the result for five minutes', async () => {
    const response = await request(app).get('/api/leaderboard');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        address: 'G123...3456',
        roi: 25.5,
        win_rate: 66.67,
        total_volume_xlm: 120.25,
        bets_count: 3,
      },
    ]);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['all', 'roi', 100]);
    expect(cache.set).toHaveBeenCalledWith('leaderboard:all:roi:100', response.body, 300);
  });

  it.each([
    ['all', 'roi'],
    ['month', 'wins'],
    ['week', 'volume'],
  ] as const)('applies period %s and sort %s', async (period, sort_by) => {
    const response = await request(app)
      .get('/api/leaderboard')
      .query({ limit: 25, period, sort_by });

    expect(response.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [period, sort_by, 25]);
    expect(cache.get).toHaveBeenCalledWith(`leaderboard:${period}:${sort_by}:25`);
  });

  it('rejects invalid limits and filter values', async () => {
    const response = await request(app)
      .get('/api/leaderboard')
      .query({ limit: 101, period: 'year', sort_by: 'volume' });

    expect(response.status).toBe(422);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
