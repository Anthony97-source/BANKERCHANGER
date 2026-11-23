import { useQuery } from '@tanstack/react-query';
import {
  fetchMarkets,
  type MarketFilters,
  type PaginationParams,
} from '../../services/api';

export function useMarkets(filters?: MarketFilters, pagination?: PaginationParams) {
  return useQuery({
    queryKey: ['markets', filters ?? {}, pagination ?? {}],
    queryFn: () => fetchMarkets(filters, pagination),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
