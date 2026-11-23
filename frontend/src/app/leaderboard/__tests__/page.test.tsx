import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardPage from '../page';
import { useLeaderboard } from '../../../hooks/useLeaderboard';
import { useWallet } from '../../../hooks/useWallet';

jest.mock('../../../hooks/useLeaderboard', () => ({ useLeaderboard: jest.fn() }));
jest.mock('../../../hooks/useWallet', () => ({ useWallet: jest.fn() }));

describe('LeaderboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useWallet).mockReturnValue({
      address: 'GUSER123456789',
      balance: null,
      isConnected: true,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      connectByType: jest.fn(),
      disconnect: jest.fn(),
      availableWallets: { freighter: true, albedo: false },
    });
  });

  it('shows a loading state accessibly', () => {
    jest.mocked(useLeaderboard).mockReturnValue({
      leaderboard: null,
      myRank: null,
      isMyRankInTopN: false,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<LeaderboardPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders ranked entries, highlights the current user, and shows their rank', () => {
    jest.mocked(useLeaderboard).mockReturnValue({
      leaderboard: {
        entries: [
          { rank: 1, address: 'GUSER123456789', predictions: 5, score: 100 },
          { rank: 2, address: 'GOTHER123456789', predictions: 3, score: 80 },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      myRank: { rank: 1, score: 100 },
      isMyRankInTopN: true,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<LeaderboardPage />);

    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.getByText('(You)')).toBeInTheDocument();
    expect(screen.getByTestId('your-rank-card')).toHaveAttribute('aria-live', 'polite');
  });

  it('announces an error and an empty leaderboard', () => {
    jest.mocked(useLeaderboard).mockReturnValue({
      leaderboard: { entries: [], updatedAt: '2026-01-01T00:00:00.000Z' },
      myRank: null,
      isMyRankInTopN: false,
      isLoading: false,
      error: new Error('offline'),
      refetch: jest.fn(),
    });

    render(<LeaderboardPage />);
    expect(screen.getByText('Failed to load leaderboard.')).toBeInTheDocument();
    expect(screen.getByText('No rankings yet.')).toBeInTheDocument();
  });
});
