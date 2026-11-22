import { useQuery } from '@tanstack/react-query';
import { fetchMarketStats } from '../../services/api';

export function useMarketStats(marketId: string) {
  return useQuery({
    queryKey: ['marketStats', marketId],
    queryFn: () => fetchMarketStats(marketId),
    enabled: Boolean(marketId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
