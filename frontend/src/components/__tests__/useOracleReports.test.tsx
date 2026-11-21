import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOracleReports } from '../../hooks/queries/useOracleReports';
import { fetchOracleReports } from '../../services/api';

jest.mock('../../services/api', () => ({
  fetchOracleReports: jest.fn(),
}));

describe('useOracleReports', () => {
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

  it('fetches and caches reports by match ID', async () => {
    (fetchOracleReports as jest.Mock).mockResolvedValue([{ timestamp: '2026-01-01T00:00:00Z' }]);

    const { result } = renderHook(() => useOracleReports('match-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(fetchOracleReports).toHaveBeenCalledWith('match-1');
    expect(queryClient.getQueryData(['oracleReports', 'match-1'])).toEqual(result.current.data);
  });

  it('exposes API errors through the query result', async () => {
    (fetchOracleReports as jest.Mock).mockRejectedValue(new Error('Report request failed'));

    const { result } = renderHook(() => useOracleReports('missing-match'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Report request failed'));
  });
});
