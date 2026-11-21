import { setupServer } from 'msw/node';
import { rest } from 'msw';

// Set API base URL before importing the client so module-level checks pass
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001/api';

// Mock the sleep delay used by retry logic to keep tests fast
jest.mock('../services/api', () => {
  const actual = jest.requireActual('../services/api');
  return {
    ...actual,
    // If the module exports a sleep helper, override it; otherwise rely on fake timers
  };
});

import { fetchMarkets, NetworkError } from '../services/api';
import { server } from './mocks/handlers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL as string;

describe('API client integration', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('success path', () => {
    it('fetchMarkets returns parsed data', async () => {
      const markets = await fetchMarkets();

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
      expect(markets[0]).toHaveProperty('id');
      expect(markets[0]).toHaveProperty('question');
    });
  });

  describe('4xx error path', () => {
    it('surfaces a NetworkError with the status in the message and does not retry', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      server.use(
        rest.get(`${API_BASE}/markets`, (_req, res, ctx) => {
          return res(ctx.status(400), ctx.json({ error: 'Bad Request' }));
        })
      );

      await expect(fetchMarkets()).rejects.toBeInstanceOf(NetworkError);
      await expect(fetchMarkets()).rejects.toThrow(/400/);

      // 4xx should not be retried: exactly one fetch per call
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('5xx retry path', () => {
    it('retries on 503 and resolves after eventual success', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      let attempts = 0;

      server.use(
        rest.get(`${API_BASE}/markets`, (_req, res, ctx) => {
          attempts += 1;
          if (attempts < 3) {
            return res(ctx.status(503), ctx.json({ error: 'Service Unavailable' }));
          }
          return res(
            ctx.status(200),
            ctx.json([{ id: '1', question: 'Will it work?' }])
          );
        })
      );

      const markets = await fetchMarkets();

      expect(markets).toEqual([{ id: '1', question: 'Will it work?' }]);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('rejects with NetworkError when all retries fail', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      server.use(
        rest.get(`${API_BASE}/markets`, (_req, res, ctx) => {
          return res(ctx.status(503), ctx.json({ error: 'Service Unavailable' }));
        })
      );

      await expect(fetchMarkets()).rejects.toBeInstanceOf(NetworkError);
      // initial attempt + retries
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('network error path', () => {
    it('rejects with NetworkError after retries when fetch rejects', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchMarkets()).rejects.toBeInstanceOf(NetworkError);
      // initial attempt + retries
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });
});