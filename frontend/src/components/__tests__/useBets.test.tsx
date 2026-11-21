import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBets } from '../../hooks/queries/useBets';
import { fetchBetsByAddress } from '../../services/api';

jest.mock('../../services/api', () => ({
  fetchBetsByAddress: jest.fn(),
}));

describe('useBets', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fetches subsequent pages using the opaque cursor returned by the API', async () => {
    (fetchBetsByAddress as jest.Mock)
      .mockResolvedValueOnce({
        bets: [{ market_id: 'market-1' }],
        nextCursor: 'opaque/cursor+value',
        limit: 25,
      })
      .mockResolvedValueOnce({ bets: [], nextCursor: null, limit: 25 });

    const { result } = renderHook(() => useBets('GTEST'), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(fetchBetsByAddress).toHaveBeenNthCalledWith(1, 'GTEST', null, 25);
    expect(fetchBetsByAddress).toHaveBeenNthCalledWith(2, 'GTEST', 'opaque/cursor+value', 25);
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  });

  it('does not request bets without a wallet address', () => {
    renderHook(() => useBets(null), { wrapper });
    expect(fetchBetsByAddress).not.toHaveBeenCalled();
  });
});
