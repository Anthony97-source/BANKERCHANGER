import { useQuery } from '@tanstack/react-query';
import { fetchMarketById } from '../../services/api';

export function useMarketById(marketId: string) {
  return useQuery({
    queryKey: ['market', marketId],
    queryFn: () => fetchMarketById(marketId),
    enabled: Boolean(marketId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
