import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlaceBet } from '../../hooks/mutations/usePlaceBet';
import * as walletService from '../../services/wallet';

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

jest.mock('../ui/ToastProvider', () => ({
  useToast: () => mockToast,
}));

jest.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    address: 'GTEST1234567890',
    isConnected: true,
  }),
}));

describe('usePlaceBet Optimistic Rollback', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('rolls back portfolio state and shows toast on transaction failure', async () => {
    const initialPortfolio = {
      address: 'GTEST1234567890',
      total_staked_xlm: 100,
      active_bets: [],
      pending_claims: [],
      past_bets: [],
    };
    const initialBets = {
      pages: [{ bets: [], total: 0, nextCursor: null, limit: 25 }],
      pageParams: [null],
    };

    queryClient.setQueryData(['portfolio', 'GTEST1234567890'], initialPortfolio);
    queryClient.setQueryData(['bets', 'GTEST1234567890'], initialBets);

    // Mock failure
    jest.spyOn(walletService, 'submitBetWithStages').mockRejectedValueOnce(new Error('On-chain tx failed'));

    const { result } = renderHook(() => usePlaceBet(), { wrapper });

    await act(async () => {
      try {
        await result.current.placeBet('market-1', 'fighter_a', 50);
      } catch {
        // Expected rejection
      }
    });

    // Check portfolio state restored
    const restoredPortfolio = queryClient.getQueryData(['portfolio', 'GTEST1234567890']);
    expect(restoredPortfolio).toEqual(initialPortfolio);
    expect(queryClient.getQueryData(['bets', 'GTEST1234567890'])).toEqual(initialBets);

    // Check toast notification
    expect(mockToast.error).toHaveBeenCalledWith('Bet failed: On-chain tx failed. Your balance has been restored.');
  });

  it('updates portfolio and bets optimistically and exposes the pending state', async () => {
    const initialPortfolio = {
      address: 'GTEST1234567890',
      total_staked_xlm: 100,
      active_bets: [],
      pending_claims: [],
      past_bets: [],
    };
    const initialBets = {
      pages: [{ bets: [], total: 0, nextCursor: null, limit: 25 }],
      pageParams: [null],
    };
    queryClient.setQueryData(['portfolio', 'GTEST1234567890'], initialPortfolio);
    queryClient.setQueryData(['bets', 'GTEST1234567890'], initialBets);

    let resolveBet!: (hash: string) => void;
    jest.spyOn(walletService, 'submitBetWithStages').mockReturnValue(
      new Promise((resolve) => {
        resolveBet = resolve;
      }),
    );

    const { result } = renderHook(() => usePlaceBet(), { wrapper });
    let submission!: Promise<void>;
    act(() => {
      submission = result.current.placeBet('market-1', 'fighter_a', 50);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    const optimisticPortfolio = queryClient.getQueryData<{ active_bets: unknown[] }>([
      'portfolio',
      'GTEST1234567890',
    ]);
    const optimisticBets = queryClient.getQueryData<{ pages: Array<{ bets: unknown[] }> }>([
      'bets',
      'GTEST1234567890',
    ]);
    expect(optimisticPortfolio?.active_bets).toHaveLength(1);
    expect(optimisticBets?.pages[0].bets).toHaveLength(1);

    await act(async () => {
      resolveBet('tx-hash');
      await submission;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('invalidates market and portfolio queries on error rollback', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    jest.spyOn(walletService, 'submitBetWithStages').mockRejectedValueOnce(new Error('User rejected'));

    const { result } = renderHook(() => usePlaceBet(), { wrapper });

    await act(async () => {
      try {
        await result.current.placeBet('market-2', 'fighter_b', 25);
      } catch {
        // Expected
      }
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['market', 'market-2'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio', 'GTEST1234567890'] });
  });
});

