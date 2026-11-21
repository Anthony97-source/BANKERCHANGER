import { useQuery } from '@tanstack/react-query';
import { fetchOracleReports } from '../../services/api';

export function useOracleReports(matchId?: string | null) {
  return useQuery({
    queryKey: ['oracleReports', matchId],
    queryFn: () => {
      if (!matchId) {
        throw new Error('A match ID is required to fetch oracle reports');
      }
      return fetchOracleReports(matchId);
    },
    enabled: Boolean(matchId),
    staleTime: 30_000,
  });
}
