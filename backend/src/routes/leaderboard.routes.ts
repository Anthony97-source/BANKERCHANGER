import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validation.middleware';
import * as cache from '../services/cache.service';
import { pool } from '../config/db';

const router = Router();

const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  period: z.enum(['all', 'month', 'week']).default('all'),
  sort_by: z.enum(['roi', 'wins', 'volume']).default('roi'),
});

type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

interface LeaderboardRow {
  bettor_address: string;
  roi: string | number;
  win_rate: string | number;
  total_volume_xlm: string | number;
  bets_count: string | number;
}

interface LeaderboardEntry {
  address: string;
  roi: number;
  win_rate: number;
  total_volume_xlm: number;
  bets_count: number;
}

function truncateAddress(address: string): string {
  return address.length <= 8 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     summary: Get the bettor leaderboard
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 100
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [all, month, week]
 *           default: all
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [roi, wins, volume]
 *           default: roi
 *     responses:
 *       200:
 *         description: Bettor rankings
 */
router.get(
  '/',
  validateQuery(leaderboardQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, period, sort_by } = req.query as unknown as LeaderboardQuery;
      const cacheKey = `leaderboard:${period}:${sort_by}:${limit}`;
      const cached = await cache.get<LeaderboardEntry[]>(cacheKey);
      if (cached !== null) {
        res.status(200).json(cached);
        return;
      }

      const { rows } = await pool.query<LeaderboardRow>(
        `WITH bet_results AS (
           SELECT
             b.bettor_address,
             b.amount::numeric AS amount_stroops,
             COALESCE(NULLIF(b.amount_xlm::numeric, 0), b.amount::numeric / 10000000) AS amount_xlm,
             (m.status = 'resolved' AND m.outcome IS NOT NULL AND m.outcome <> 'no_contest') AS is_decided,
             (m.status = 'resolved' AND m.outcome = b.side) AS is_win,
             CASE
               WHEN m.status = 'resolved' AND m.outcome IS NOT NULL AND m.outcome <> 'no_contest' THEN
                 CASE
                   WHEN m.outcome = b.side THEN
                     COALESCE(
                       b.payout::numeric,
                       b.amount::numeric
                         * (m.total_pool::numeric * (10000 - COALESCE(m.fee_bps, 200)) / 10000)
                         / NULLIF(
                           CASE m.outcome
                             WHEN 'fighter_a' THEN m.pool_a::numeric
                             WHEN 'fighter_b' THEN m.pool_b::numeric
                             WHEN 'draw' THEN m.pool_draw::numeric
                           END,
                           0
                         ),
                       b.amount::numeric
                     ) - b.amount::numeric
                   ELSE -b.amount::numeric
                 END
               ELSE 0
             END AS net_profit_stroops
           FROM bets b
           JOIN markets m ON m.market_id = b.market_id
           WHERE $1 = 'all'
              OR ($1 = 'month' AND b.placed_at >= NOW() - INTERVAL '1 month')
              OR ($1 = 'week' AND b.placed_at >= NOW() - INTERVAL '1 week')
         ),
         bettor_totals AS (
           SELECT
             bettor_address,
             COUNT(*)::int AS bets_count,
             COUNT(*) FILTER (WHERE is_win)::int AS wins,
             COUNT(*) FILTER (WHERE is_decided)::int AS decided_bets,
             COALESCE(SUM(amount_xlm), 0) AS total_volume_xlm,
             COALESCE(SUM(net_profit_stroops), 0) AS net_profit_stroops,
             COALESCE(SUM(amount_stroops) FILTER (WHERE is_decided), 0) AS decided_stake_stroops
           FROM bet_results
           GROUP BY bettor_address
         ),
         leaderboard AS (
           SELECT
             bettor_address,
             ROUND(
               CASE WHEN decided_stake_stroops = 0 THEN 0
                    ELSE net_profit_stroops * 100 / decided_stake_stroops
               END,
               2
             ) AS roi,
             ROUND(
               CASE WHEN decided_bets = 0 THEN 0
                    ELSE wins::numeric * 100 / decided_bets
               END,
               2
             ) AS win_rate,
             total_volume_xlm,
             bets_count,
             wins
           FROM bettor_totals
         )
         SELECT bettor_address, roi, win_rate, total_volume_xlm, bets_count
         FROM leaderboard
         ORDER BY
           CASE WHEN $2 = 'roi' THEN roi END DESC,
           CASE WHEN $2 = 'wins' THEN wins END DESC,
           CASE WHEN $2 = 'volume' THEN total_volume_xlm END DESC,
           roi DESC,
           bettor_address ASC
         LIMIT $3`,
        [period, sort_by, limit],
      );

      const leaderboard = rows.map((row): LeaderboardEntry => ({
        address: truncateAddress(row.bettor_address),
        roi: Number(row.roi),
        win_rate: Number(row.win_rate),
        total_volume_xlm: Number(row.total_volume_xlm),
        bets_count: Number(row.bets_count),
      }));

      await cache.set(cacheKey, leaderboard, 300);
      res.status(200).json(leaderboard);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
