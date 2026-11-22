import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/index';

// Mock MarketService so tests don't need a real DB
jest.mock('../../src/services/MarketService');

import * as MarketService from '../../src/services/MarketService';

const mockMarket = {
  market_id: 'market-1',
  match_id: 'fight-1',
  status: 'open',
  weight_class: 'Heavyweight',
  fighter_a: 'Fighter A',
  fighter_b: 'Fighter B',
  scheduled_at: new Date().toISOString(),
  contract_address: 'GABC123',
};

const mockBet = {
  bet_id: 'bet-1',
  market_id: 'market-1',
  bettor_address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  outcome: 'fighter_a',
  amount: '100',
};

const mockStats = {
  market_id: 'market-1',
  total_bets: 10,
  total_volume: '1000',
  fighter_a_volume: '600',
  fighter_b_volume: '400',
};

const mockPlatformStats = {
  totalMarkets: 5,
  activeMarkets: 3,
  totalVolume: '50000',
  totalBets: 200,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/markets', () => {
  it('returns 200 with markets list', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({
      markets: [mockMarket],
      total: 1,
    });

    const res = await request(app).get('/api/markets');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ markets: [mockMarket], total: 1, page: 1, limit: 20 });
  });

  it('filters by status', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [], total: 0 });

    const res = await request(app).get('/api/markets?status=open');

    expect(res.status).toBe(200);
    expect(MarketService.getMarkets).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' }),
      expect.anything(),
    );
  });

  it('filters by weight_class', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [mockMarket], total: 1 });

    const res = await request(app).get('/api/markets?weight_class=Heavyweight');

    expect(res.status).toBe(200);
    expect(MarketService.getMarkets).toHaveBeenCalledWith(
      expect.objectContaining({ weight_class: 'Heavyweight' }),
      expect.anything(),
    );
  });

  it('supports pagination params', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [], total: 0 });

    const res = await request(app).get('/api/markets?page=2&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 10 });
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).get('/api/markets?status=invalid');
    expect(res.status).toBe(400);
  });

  it('returns 400 for page < 1', async () => {
    const res = await request(app).get('/api/markets?page=0');
    expect(res.status).toBe(400);
  });

  it('accepts limit = 200 (at maximum)', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [], total: 0 });
    const res = await request(app).get('/api/markets?limit=200');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ limit: 200 });
  });

  it('returns 400 for limit > 200', async () => {
    const res = await request(app).get('/api/markets?limit=201');
    expect(res.status).toBe(400);
  });

  it('validates dateFrom as valid date', async () => {
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [], total: 0 });
    const validDate = '2026-06-25T12:00:00Z';
    const res = await request(app).get(`/api/markets?dateFrom=${encodeURIComponent(validDate)}`);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid dateFrom format', async () => {
    const res = await request(app).get('/api/markets?dateFrom=not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid dateTo format', async () => {
    const res = await request(app).get('/api/markets?dateTo=invalid-date');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/markets/:id', () => {
  it('returns 200 with market data', async () => {
    const marketWithOdds = {
      ...mockMarket,
      odds: { odds_a: 5000, odds_b: 3000, odds_draw: 2000 },
    };
    (MarketService.getMarketById as jest.Mock).mockResolvedValue(marketWithOdds);

    const res = await request(app).get('/api/markets/market-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      market_id: 'market-1',
      odds: { odds_a: 5000, odds_b: 3000, odds_draw: 2000 },
    });
    expect(MarketService.getMarketById).toHaveBeenCalledWith('market-1');
  });

  it('returns 404 when market not found', async () => {
    const { AppError } = await import('../../src/utils/AppError');
    (MarketService.getMarketById as jest.Mock).mockRejectedValue(
      AppError.notFound('Market not found'),
    );

    const res = await request(app).get('/api/markets/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Market not found' });
  });
});

describe('GET /api/markets/:id/bets', () => {
  it('returns all market bets when no address is provided', async () => {
    (MarketService.getBetsByMarket as jest.Mock).mockResolvedValue([mockBet]);

    const res = await request(app).get('/api/markets/market-1/bets');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([mockBet]);
    expect(MarketService.getBetsByMarket).toHaveBeenCalledWith('market-1', undefined);
  });

  it('filters bets by a valid Stellar address', async () => {
    (MarketService.getBetsByMarket as jest.Mock).mockResolvedValue([mockBet]);

    const res = await request(app).get(
      `/api/markets/market-1/bets?address=${mockBet.bettor_address}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([mockBet]);
    expect(MarketService.getBetsByMarket).toHaveBeenCalledWith(
      'market-1',
      mockBet.bettor_address,
    );
  });

  it('returns 400 for an invalid Stellar address', async () => {
    const res = await request(app).get('/api/markets/market-1/bets?address=invalid');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid Stellar address format' });
    expect(MarketService.getBetsByMarket).not.toHaveBeenCalled();
  });

  it('returns an empty array when the market has no bets', async () => {
    (MarketService.getBetsByMarket as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/markets/market-1/bets');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/markets/:id/odds', () => {
  it('returns 200 with market stats (odds)', async () => {
    (MarketService.getMarketStats as jest.Mock).mockResolvedValue(mockStats);

    const res = await request(app).get('/api/markets/market-1/stats');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ market_id: 'market-1' });
  });

  it('returns 404 when market not found', async () => {
    const { AppError } = await import('../../src/utils/AppError');
    (MarketService.getMarketStats as jest.Mock).mockRejectedValue(
      AppError.notFound('Market not found'),
    );

    const res = await request(app).get('/api/markets/nonexistent/stats');

    expect(res.status).toBe(404);
  });
});

describe('Admin endpoints require JWT', () => {
  it('returns 401 on POST /api/admin/dispute/:id without token', async () => {
    const res = await request(app).post('/api/admin/dispute/market-1');
    expect(res.status).toBe(401);
  });

  it('returns 401 on POST /api/admin/cancel/:id without token', async () => {
    const res = await request(app).post('/api/admin/cancel/market-1');
    expect(res.status).toBe(401);
  });

  it('returns 401 on POST /api/admin/resolve-dispute/:id without token', async () => {
    const res = await request(app).post('/api/admin/resolve-dispute/market-1');
    expect(res.status).toBe(401);
  });

  it('returns 401 on GET /api/admin/disputes without token', async () => {
    const res = await request(app).get('/api/admin/disputes');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/stats', () => {
  it('returns 200 with platform stats', async () => {
    (MarketService.getPlatformStats as jest.Mock).mockResolvedValue(mockPlatformStats);

    const res = await request(app).get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(mockPlatformStats);
  });
});
