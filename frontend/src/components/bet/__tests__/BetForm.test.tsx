import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { marketFixture } from '../../../../.storybook/marketFixture';
import { BetForm } from '../BetForm';
import { useWallet } from '../../../hooks/useWallet';
import { usePlaceBet } from '../../../hooks/usePlaceBet';

const mockPlaceBet = jest.fn();
const mockSetTxStatus = jest.fn();

jest.mock('../../../hooks/useWallet', () => ({ useWallet: jest.fn() }));
jest.mock('../../../hooks/usePlaceBet', () => ({ usePlaceBet: jest.fn() }));
jest.mock('../../../store', () => ({
  useAppStore: (selector: (state: { setTxStatus: typeof mockSetTxStatus }) => unknown) =>
    selector({ setTxStatus: mockSetTxStatus }),
}));

describe('BetForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useWallet).mockReturnValue({
      address: 'GTEST_USER',
      balance: 100,
      isConnected: true,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      connectByType: jest.fn(),
      disconnect: jest.fn(),
      availableWallets: { freighter: true, albedo: false },
    });
    jest.mocked(usePlaceBet).mockReturnValue({
      placeBet: mockPlaceBet,
      txStatus: { hash: null, status: 'idle', error: null },
      txHash: null,
      error: null,
      isLoading: false,
      isPending: false,
      reset: jest.fn(),
    });
  });

  it('validates the amount and announces accessible errors', () => {
    render(<BetForm market={marketFixture} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fighter A' }));
    const amount = screen.getByRole('spinbutton', { name: /amount \(xlm\)/i });

    fireEvent.change(amount, { target: { value: '0.5' } });
    fireEvent.blur(amount);

    expect(screen.getByRole('alert')).toHaveTextContent('Minimum bet is 1 XLM.');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('group', { name: 'Select outcome' })).toBeInTheDocument();
  });

  it('submits the selected outcome and amount', async () => {
    mockPlaceBet.mockResolvedValue(undefined);
    render(<BetForm market={marketFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fighter A' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /amount \(xlm\)/i }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place Bet' }));

    await waitFor(() => {
      expect(mockPlaceBet).toHaveBeenCalledWith(marketFixture.market_id, 'fighter_a', 10);
    });
  });

  it('shows a closed state for resolved markets', () => {
    render(<BetForm market={{ ...marketFixture, status: 'resolved' }} />);

    expect(screen.getByText('Betting is closed')).toBeInTheDocument();
    expect(screen.getByText('Market is resolved')).toBeInTheDocument();
  });

  it('announces transaction failures to assistive technology', () => {
    jest.mocked(usePlaceBet).mockReturnValue({
      placeBet: mockPlaceBet,
      txStatus: { hash: null, status: 'error', error: 'Transaction rejected' },
      txHash: null,
      error: 'Transaction rejected',
      isLoading: false,
      isPending: false,
      reset: jest.fn(),
    });

    render(<BetForm market={marketFixture} />);
    expect(screen.getByRole('status')).toHaveTextContent('Transaction failed');
    expect(screen.getByRole('status')).toHaveTextContent('Transaction rejected');
  });
});
