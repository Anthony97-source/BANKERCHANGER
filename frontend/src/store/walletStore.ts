import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  address: string | null;
  balance: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  networkId: string;
  setAddress: (address: string | null) => void;
  setBalance: (balance: number | null) => void;
  setWallet: (address: string, balance: number | null) => void;
  setIsConnecting: (isConnecting: boolean) => void;
  setNetworkId: (networkId: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      balance: null,
      isConnected: false,
      isConnecting: false,
      networkId: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet',
      setAddress: (address) => set({ address, isConnected: address !== null }),
      setBalance: (balance) => set({ balance }),
      setWallet: (address, balance) => set({ address, balance, isConnected: true }),
      setIsConnecting: (isConnecting) => set({ isConnecting }),
      setNetworkId: (networkId) => set({ networkId }),
      disconnect: () => set({ address: null, balance: null, isConnected: false, isConnecting: false }),
    }),
    {
      name: 'bankerchanger-wallet',
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.setIsConnecting(false),
    },
  ),
);
