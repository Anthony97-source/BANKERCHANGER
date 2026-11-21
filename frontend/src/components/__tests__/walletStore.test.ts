import { useWalletStore } from '../../store/walletStore';

describe('wallet store persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('bankerchanger-wallet');
    useWalletStore.getState().disconnect();
    useWalletStore.getState().setNetworkId('testnet');
  });

  it('persists wallet details and network to localStorage', () => {
    useWalletStore.getState().setWallet('GTEST', 125);
    useWalletStore.getState().setNetworkId('mainnet');

    const stored = JSON.parse(localStorage.getItem('bankerchanger-wallet') ?? '{}');
    expect(stored.state).toMatchObject({
      address: 'GTEST',
      balance: 125,
      isConnected: true,
      networkId: 'mainnet',
    });
  });

  it('clears persisted wallet details on disconnect', () => {
    useWalletStore.getState().setWallet('GTEST', 125);
    useWalletStore.getState().disconnect();

    const stored = JSON.parse(localStorage.getItem('bankerchanger-wallet') ?? '{}');
    expect(stored.state).toMatchObject({
      address: null,
      balance: null,
      isConnected: false,
    });
  });
});
