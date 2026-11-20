'use client';

import { useWallet } from '../../hooks/useWallet';

interface ConnectPromptProps {
  message?: string;
}

export function ConnectPrompt({ message = 'Connect your Freighter wallet to place bets' }: ConnectPromptProps): JSX.Element {
  const { connect } = useWallet();

  return (
    <div className="rounded-xl bg-gray-900 p-6 text-center space-y-3">
      <p className="text-gray-300 text-sm">{message}</p>
      <button
        type="button"
        onClick={connect}
        aria-label="Connect your Freighter wallet"
        className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      >
        Connect Wallet
      </button>
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center min-h-[44px] text-xs text-amber-400 hover:text-amber-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
      >
        Don&apos;t have Freighter? Get it here
        <span className="sr-only"> (opens in a new tab)</span>
        <span aria-hidden="true"> →</span>
      </a>
    </div>
  );
}