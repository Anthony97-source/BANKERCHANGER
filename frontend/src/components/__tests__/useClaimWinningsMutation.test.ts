import { renderHook, act, waitFor } from '@testing-library/react';
import { useClaimWinnings } from '../../hooks/mutations/useClaimWinnings';
import * as api from '../../services/api';
import * as wallet from '../../services/wallet';

jest.mock('../../services/api');
jest.mock('../../services/wallet');

const marketId = 'm1';
const address = 'GABC123';

beforeEach(() => {
  jest.clearAllMocks();
  (wallet.submitClaimWithStages as jest.Mock).mockResolvedValue('tx-hash');
});

test('AC #2 — does not submit when the bet is already claimed', async () => {
  (api.fetchBetsByMarket as jest.Mock).mockResolvedValue([
    { market_id: marketId, bettor_address: address, claimed: true, payout: 100 },
  ]);

  const { result } = renderHook(() => useClaimWinnings(address));

  await act(async () => {
    await result.current.claimWinnings(marketId);
  });

  expect(wallet.submitClaimWithStages).not.toHaveBeenCalled();
  expect(result.current.hasClaimed).toBe(true);
});

test('AC #1 — a second click during submit is a no-op', async () => {
  (api.fetchBetsByMarket as jest.Mock).mockResolvedValue([
    { market_id: marketId, bettor_address: address, claimed: false },
  ]);

  let resolveSubmit: (hash: string) => void = () => {};
  (wallet.submitClaimWithStages as jest.Mock).mockImplementation(
    () => new Promise<string>((res) => (resolveSubmit = res)),
  );

  const { result } = renderHook(() => useClaimWinnings(address));

  // Fire two claims back-to-back in the same tick — the race the issue describes.
  let firstClaim!: Promise<void>;
  let secondClaim!: Promise<void>;
  act(() => {
    firstClaim = result.current.claimWinnings(marketId);
    secondClaim = result.current.claimWinnings(marketId);
  });
  await waitFor(() => expect(wallet.submitClaimWithStages).toHaveBeenCalledTimes(1));

  await act(async () => {
    resolveSubmit('tx-hash');
    await Promise.all([firstClaim, secondClaim]);
  });

  expect(wallet.submitClaimWithStages).toHaveBeenCalledTimes(1);
});

test('submit proceeds for an unclaimed bet', async () => {
  (api.fetchBetsByMarket as jest.Mock).mockResolvedValue([
    { market_id: marketId, bettor_address: address, claimed: false },
  ]);

  const { result } = renderHook(() => useClaimWinnings(address));

  await act(async () => {
    await result.current.claimWinnings(marketId);
  });

  expect(wallet.submitClaimWithStages).toHaveBeenCalledWith(
    marketId,
    expect.any(Function),
  );
  await waitFor(() => expect(result.current.hasClaimed).toBe(true));
});

test('claim failure reverts state and does not leave button in claimed state', async () => {
  (api.fetchBetsByMarket as jest.Mock).mockResolvedValue([
    { market_id: marketId, bettor_address: address, claimed: false },
  ]);
  (wallet.submitClaimWithStages as jest.Mock).mockRejectedValueOnce(
    new Error('Out of gas or contract error'),
  );

  const { result } = renderHook(() => useClaimWinnings(address));

  await act(async () => {
    await result.current.claimWinnings(marketId);
  });

  expect(result.current.hasClaimed).toBe(false);
  expect(result.current.error).toBe('Out of gas or contract error');
  expect(result.current.txStatus.status).toBe('error');
});