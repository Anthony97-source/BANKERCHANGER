/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import '@testing-library/jest-dom';
import {
  fetchMarketById,
  fetchMarkets,
  fetchMarketStats,
} from '../../services/api';
import { marketFixture } from '../../../.storybook/marketFixture';
import { useMarketById } from '../../hooks/queries/useMarketById';
import { useMarkets } from '../../hooks/queries/useMarkets';
import { useMarketStats } from '../../hooks/queries/useMarketStats';

jest.mock('../../services/api', () => ({
  fetchMarketById: jest.fn(),
  fetchMarkets: jest.fn(),
  fetchMarketStats: jest.fn(),
}));

const mockedFetchMarkets = jest.mocked(fetchMarkets);
const mockedFetchMarketById = jest.mocked(fetchMarketById);
const mockedFetchMarketStats = jest.mocked(fetchMarketStats);

function createWrapper(queryClient: QueryClient) {
  return function QueryClientTestWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('market query hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();
  });

  afterEach(() => queryClient.clear());

  it('fetches markets using filters and pagination and caches the result', async () => {
    const response = {
      markets: [marketFixture],
      total: 1,
      page: 2,
      limit: 10,
    };
    mockedFetchMarkets.mockResolvedValue(response);

    const filters = { status: 'open' };
    const pagination = { page: 2, limit: 10 };
    const wrapper = createWrapper(queryClient);
    const { result, unmount } = renderHook(() => useMarkets(filters, pagination), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
    unmount();

    const cached = renderHook(() => useMarkets(filters, pagination), { wrapper });
    expect(cached.result.current.data).toEqual(response);
    expect(mockedFetchMarkets).toHaveBeenCalledTimes(1);
    expect(mockedFetchMarkets).toHaveBeenCalledWith(filters, pagination);
  });

  it('loads one market and exposes query errors', async () => {
    const market = marketFixture;
    mockedFetchMarketById.mockResolvedValueOnce(market).mockRejectedValueOnce(new Error('offline'));
    const wrapper = createWrapper(queryClient);

    const { result, rerender } = renderHook(({ id }) => useMarketById(id), {
      initialProps: { id: market.market_id },
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(market));
    expect(mockedFetchMarketById).toHaveBeenCalledWith(market.market_id);

    rerender({ id: 'market-2' });
    await waitFor(() => expect(result.current.error).toEqual(new Error('offline')));
  });

  it('does not request empty market IDs and loads market statistics', async () => {
    const stats: Awaited<ReturnType<typeof fetchMarketStats>> = {
      market_id: 'market-1',
      total_bets: 2,
      unique_bettors: 2,
      largest_bet_xlm: 10,
      average_bet_xlm: 5,
      total_pooled_xlm: 15,
    };
    mockedFetchMarketStats.mockResolvedValue(stats);
    const wrapper = createWrapper(queryClient);

    const disabled = renderHook(() => useMarketStats(''), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(mockedFetchMarketStats).not.toHaveBeenCalled();

    const enabled = renderHook(() => useMarketStats('market-1'), { wrapper });
    await waitFor(() => expect(enabled.result.current.data).toEqual(stats));
    expect(mockedFetchMarketStats).toHaveBeenCalledWith('market-1');
  });
});
