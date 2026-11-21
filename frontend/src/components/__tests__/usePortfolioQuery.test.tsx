import { act, renderHook, waitFor } from '@testing-library/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { calculatePortfolioPerformance, usePortfolio } from '../../hooks/queries/usePortfolio';
import type { Market, Portfolio } from '../../types';

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
}));
jest.mock('../../hooks/useWallet', () => ({ useWallet: () => ({ address: 'GTEST' }) }));
jest.mock('../../services/api', () => ({ fetchPortfolio: jest.fn() }));
jest.mock('../../services/wallet', () => ({ submitClaim: jest.fn(), submitRefund: jest.fn() }));

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = jest.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const bets: NonNullable<Portfolio['active_bets']> = [
  { id: 1, market_id: 'market-1', side: 'fighter_a', amount: '10000000', amount_xlm: 1 },
  { id: 2, market_id: 'market-2', side: 'fighter_b', amount: '20000000', amount_xlm: 2 },
];

const markets = [
  { market_id: 'market-1', pool_a: '40000000', pool_b: '60000000', pool_draw: '0', total_pool: '100000000', fee_bps: 100 },
  { market_id: 'market-2', pool_a: '20000000', pool_b: '80000000', pool_draw: '0', total_pool: '100000000', fee_bps: 0 },
] as Market[];

const portfolio = { active_bets: bets, past_bets: [], pending_claims: [] } as unknown as Portfolio;

describe('usePortfolio performance', () => {
  const originalEventSource = window.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    window.EventSource = MockEventSource as unknown as typeof EventSource;
    (useQuery as jest.Mock).mockReturnValue({
      data: portfolio,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    (useInfiniteQuery as jest.Mock).mockReturnValue({
      data: { pages: [{ bets: [], total: 0, nextCursor: null, limit: 25 }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.EventSource = originalEventSource;
  });

  it('aggregates the current value and P&L for two open bets', () => {
    const performance = calculatePortfolioPerformance(bets, markets);

    expect(performance.totalInvestedXlm).toBe(3);
    expect(performance.currentValueXlm).toBeCloseTo(4.975);
    expect(performance.unrealizedPnlXlm).toBeCloseTo(1.975);
    expect(performance.unrealizedPnlPercent).toBeCloseTo(65.8333, 3);
  });

  it('updates the aggregate when live market odds change', async () => {
    const { result } = renderHook(() => usePortfolio(markets));
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(2));
    const stream = MockEventSource.instances.find(({ url }) => url.includes('market-1'))!;

    act(() => stream.emit(JSON.stringify({
      market_id: 'market-1',
      fighter_a: { multiplier: 3.465 },
      fighter_b: { multiplier: 0.7 },
      draw: { multiplier: 0 },
      total_pool: '140000000',
    })));

    await waitFor(() => expect(result.current.performance.currentValueXlm).toBeCloseTo(5.965));
    expect(result.current.performance.unrealizedPnlXlm).toBeCloseTo(2.965);
  });
});