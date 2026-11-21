'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Bet, Market } from '../../types';
import { useWallet } from '../../hooks/useWallet';
import { useClaimWinnings } from '../../hooks/mutations/useClaimWinnings';
import { TransactionStatus } from '../ui/TransactionStatus';
import { stellarExplorerUrl } from '../../services/wallet';

function formatXlm(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`;
}

type ClaimWinningsPanelProps = {
  market: Market;
  /** All bets for this market; used to find the current wallet's bet and whether it is claimable. */
  allBets: Bet[];
};

function getMyBets(allBets: Bet[], walletAddress: string | null | undefined): Bet[] {
  if (!walletAddress) return [];
  // Backend Bet.tx_hash is a transaction hash; we can't reliably map to wallet address.
  // So we fall back to `address` only if it exists.
  return allBets.filter((b) => (b as any).address === walletAddress);
}

export function ClaimWinningsPanel({ market, allBets }: ClaimWinningsPanelProps): JSX.Element {
  const { address } = useWallet();
  const { claimWinnings, txStatus, isSubmitting, reset } = useClaimWinnings();

  const myBets = useMemo(() => getMyBets(allBets, address), [allBets, address]);
  // Prefer the latest bet from this wallet.
  const myBet =
    myBets
      .slice()
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())[0] ?? null;

  const marketResolved = market.status === 'resolved';
  const alreadyClaimed = myBet?.claimed === true;
  const myPayout = myBet?.payout != null ? Number(myBet.payout) : null;
  const bettorLost = myBet != null && (myBet.payout == null || myPayout === null || myPayout <= 0);
  const canClaim =
    Boolean(address) &&
    marketResolved &&
    myBet != null &&
    !alreadyClaimed &&
    !bettorLost &&
    !isSubmitting &&
    txStatus.status === 'idle';

  const projectedPayout = useMemo(() => {
    if (!myBet || myBet.claimed) return null;
    if (myBet.payout == null) return null;
    const payoutNum = Number(myBet.payout);
    return payoutNum > 0 ? payoutNum : null;
  }, [myBet]);

  const success = txStatus.status === 'success';
  const isPending = ['signing', 'broadcasting', 'confirming'].includes(txStatus.status);
  const isError = txStatus.status === 'error';

  const claimButtonRef = useRef<HTMLButtonElement | null>(null);
  const successRef = useRef<HTMLParagraphElement | null>(null);

  // Reset error/success if market changes away from resolved.
  useEffect(() => {
    if (!marketResolved) reset();
  }, [marketResolved, reset]);

  // Move focus to the success message once the claim completes so keyboard and
  // screen reader users are informed of the outcome.
  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  const statusMessageId = 'claim-winnings-status';
  const errorMessageId = 'claim-winnings-error';
  const describedBy = isError ? `${statusMessageId} ${errorMessageId}` : statusMessageId;

  return (
    <section className="bg-gray-900 rounded-xl p-6 space-y-4 text-white border border-gray-800">
      <div>
        <h2 className="text-lg font-bold">Claim winnings</h2>
        <p className="text-sm text-gray-400 mt-1">
          Collect your projected payout after the market resolves.
        </p>
      </div>

      {/* Disabled states + projected payout */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400">Projected payout</p>
            <p className="text-base font-semibold mt-1">{formatXlm(projectedPayout ?? null)}</p>
          </div>
          <div className="text-right">
            {alreadyClaimed && (
              <p className="text-xs text-green-400 font-semibold">Already claimed</p>
            )}
            {!alreadyClaimed && !marketResolved && (
              <p className="text-xs text-amber-400 font-semibold">Market not resolved</p>
            )}
            {!alreadyClaimed && marketResolved && bettorLost && (
              <p className="text-xs text-gray-400 font-semibold">Bettor lost</p>
            )}
            {!alreadyClaimed && marketResolved && myBet == null && (
              <p className="text-xs text-gray-400 font-semibold">No bet found</p>
            )}
          </div>
        </div>

        <div id={statusMessageId} className="text-xs text-gray-400">
          {marketResolved
            ? alreadyClaimed
              ? 'You have already claimed your winnings for this market.'
              : bettorLost
                ? 'Your bet does not have claimable winnings.'
                : 'Ready to claim your projected payout.'
            : 'Claiming is disabled until the market is resolved.'}
        </div>
      </div>

      {/* Button + tx status */}
      <div className="space-y-2">
        {!success ? (
          <button
            ref={claimButtonRef}
            type="button"
            disabled={!canClaim}
            onClick={() => claimWinnings(market.market_id)}
            aria-describedby={describedBy}
            aria-busy={isPending}
            className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            {isPending ? 'Claiming…' : 'Claim winnings'}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="text-green-400 font-semibold focus:outline-none"
            >
              Claimed!
            </p>
            {txStatus.hash && (
              <a
                href={stellarExplorerUrl('tx', txStatus.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline text-xs font-semibold break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded"
              >
                View TX ↗<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        )}

        {/* Live region announcing claim errors, associated with the action button */}
        <div id={errorMessageId} role="alert" aria-live="assertive" className="sr-only">
          {isError ? txStatus.message ?? 'Claim failed. Please try again.' : ''}
        </div>

        {/* TransactionStatus during/after claim (single place) */}
        {txStatus.status !== 'idle' && <TransactionStatus txStatus={txStatus} onDismiss={reset} />}
      </div>
    </section>
  );
}
