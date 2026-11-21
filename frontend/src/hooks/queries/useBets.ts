import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchBetsByAddress } from '../../services/api';

const PAGE_SIZE = 25;

export function useBets(address?: string | null) {
  return useInfiniteQuery({
    queryKey: ['bets', address],
    queryFn: ({ pageParam }) => {
      if (!address) {
        throw new Error('A wallet address is required to fetch bets');
      }
      return fetchBetsByAddress(address, pageParam, PAGE_SIZE);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(address),
    staleTime: 30_000,
    gcTime: 60_000,
  });
}
