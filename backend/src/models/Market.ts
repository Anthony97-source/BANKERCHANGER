// ============================================================
// BANKERCHANGER — Market Database Model
// ORM definition for the markets table.
// Contributors: do not add business logic here — model only.
// ============================================================

export interface Market {
  /** Auto-increment primary key */
  id: number;
  /** On-chain market_id (stored as string to preserve u64 precision) */
  market_id: string;
  /** Deployed Market Soroban contract address */
  contract_address: string;
  /** Unique fight identifier matching FightDetails.match_id */
  match_id: string;
  fighter_a: string;
  fighter_b: string;
  weight_class: string;
  title_fight: boolean;
  venue: string;
  /** ISO timestamp of scheduled fight start */
  scheduled_at: Date;
  status: MarketStatusDB;
  outcome: OutcomeDB | null;
  /** Staked on FighterA — stored as string to preserve i128 precision */
  pool_a: string;
  pool_b: string;
  pool_draw: string;
  total_pool: string;
  /** Platform fee in basis points */
  fee_bps: number;
  /** Seconds before scheduled_at to stop accepting bets (default 3600) */
  lock_before_secs: number;
  resolved_at: Date | null;
  oracle_used: 'primary' | 'fallback' | 'admin' | null;
  created_at: Date;
  updated_at: Date;
  /** Stellar ledger sequence at which this market was created */
  ledger_sequence: number;
}

export type MarketStatusDB =
  | 'open'
  | 'locked'
  | 'resolved'
  | 'cancelled'
  | 'disputed';

export type OutcomeDB =
  | 'fighter_a'
  | 'fighter_b'
  | 'draw'
  | 'no_contest';

export interface MarketStats {
  market_id: string;
  total_bets_count: number;
  total_volume_xlm: number;
  odds_a: number;
  odds_b: number;
  odds_draw: number;
  top_bettors: Array<{
    bettor_address: string;
    volume_xlm: number;
  }>;
  betting_distribution: {
    A: number;
    B: number;
    DRAW: number;
  };
}

export interface PlatformStats {
  totalMarkets: number;
  activeMarkets: number;
  totalVolume: number;
  totalBets: number;
}

export interface PlatformMarketStats {
  total_markets_count: number;
  total_volume_xlm: number;
  total_bets_count: number;
  live_markets_count: number;
  unique_bettors_count: number;
  platform_fees_collected_xlm: number;
}

export interface RecentMarketSummary {
  fighter_a: string;
  fighter_b: string;
  status: MarketStatusDB;
  total_pool_xlm: number;
  created_at: Date;
}
