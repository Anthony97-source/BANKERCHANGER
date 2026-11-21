import {
  fetchBetsByAddress,
  fetchMarkets,
  fetchOracleReports,
  NetworkError,
  MarketListResponse,
} from '../api';

const emptyList: MarketListResponse = { markets: [], total: 0, page: 1, limit: 10 };

function mockFetch(body: unknown, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

afterEach(() => jest.restoreAllMocks());

describe('fetchMarkets', () => {
  it('returns typed MarketListResponse', async () => {
    mockFetch(emptyList);
    const result = await fetchMarkets();
    expect(result).toEqual(emptyList);
  });

  describe('fetchBetsByAddress', () => {
    it('sends an opaque cursor and page limit as query parameters', async () => {
      const spy = mockFetch({ bets: [], nextCursor: null, limit: 25 });
      await fetchBetsByAddress('GTEST', 'opaque/cursor+value', 25);

      const url = new URL(spy.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/api/bets/GTEST');
      expect(url.searchParams.get('cursor')).toBe('opaque/cursor+value');
      expect(url.searchParams.get('limit')).toBe('25');
    });
  });

  describe('fetchOracleReports', () => {
    it('returns reports sorted by their timestamp', async () => {
      mockFetch({
        match_id: 'match-1',
        reports: [
          { match_id: 'match-1', timestamp: '2026-01-02T00:00:00Z' },
          { match_id: 'match-1', timestamp: '2026-01-01T00:00:00Z' },
        ],
      });

      const reports = await fetchOracleReports('match-1');
      expect(reports.map((report) => report.timestamp)).toEqual([
        '2026-01-01T00:00:00Z',
        '2026-01-02T00:00:00Z',
      ]);
    });
  });

  it('appends filters and pagination as query params', async () => {
    const spy = mockFetch(emptyList);
    await fetchMarkets({ status: 'open', weight_class: 'heavyweight' }, { page: 2, limit: 5 });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('weight_class=heavyweight');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=5');
  });

  it('omits query string when no params provided', async () => {
    const spy = mockFetch(emptyList);
    await fetchMarkets();
    expect(spy.mock.calls[0][0]).not.toContain('?');
  });

  it('throws NetworkError on non-200 status', async () => {
    mockFetch({}, 500);
    await expect(fetchMarkets()).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws NetworkError on fetch failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));
    await expect(fetchMarkets()).rejects.toBeInstanceOf(NetworkError);
  });
});
