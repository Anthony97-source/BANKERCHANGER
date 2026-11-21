import { useState, useEffect, useCallback } from 'react';
import {
  connectWallet,
  connectWalletByType,
  disconnectWallet,
  getConnectedAddress,
  getWalletBalance,
  detectWallets,
} from '../services/wallet';
import type { WalletType } from '../services/wallet';
import { useAppStore } from '../store';
import { useWalletStore } from '../store/walletStore';
import { queryClient } from '../providers/QueryProvider';

export interface UseWalletResult {
  address: string | null;
  balance: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  /** Connect to a specific wallet by type (used by the wallet selection modal) */
  connectByType: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  /** Which wallet extensions are available in the current browser */
  availableWallets: { freighter: boolean; albedo: boolean };
}

const STORAGE_KEY = 'bankerchanger_wallet_address';

export function useWallet(): UseWalletResult {
  const walletAddress = useWalletStore((state) => state.address);
  const walletBalance = useWalletStore((state) => state.balance);
  const isConnecting = useWalletStore((state) => state.isConnecting);
  const setWallet = useAppStore((state) => state.setWallet);
  const clearWallet = useAppStore((state) => state.clearWallet);
  const setIsConnecting = useWalletStore((state) => state.setIsConnecting);
  const [error, setError] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<{ freighter: boolean; albedo: boolean }>({
    freighter: false,
    albedo: false,
  });

  const disconnect = useCallback(() => {
    disconnectWallet();
    sessionStorage.removeItem(STORAGE_KEY);
    clearWallet();
    useAppStore.setState({ isConnecting: false });
    queryClient.resetQueries();
  }, [clearWallet]);

  useEffect(() => {
    void useWalletStore.persist.rehydrate();
    const stored = getConnectedAddress();
    if (stored) {
      getWalletBalance()
        .then((bal) => {
          setWallet(stored, bal);
        })
        .catch(() => {});
    }
    setAvailableWallets(detectWallets());
  }, [setWallet]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkFreighter = async () => {
      try {
        const freighter = typeof window !== 'undefined' ? (window as any).freighter : null;
        if (!freighter) return;

        const isConnected = await freighter.isConnected?.();
        if (isConnected === false && walletAddress) {
          disconnect();
          return;
        }

        const pkResult = await freighter.getPublicKey?.();
        const currentKey = typeof pkResult === 'string' ? pkResult : pkResult?.publicKey;

        if (currentKey && currentKey !== walletAddress) {
          sessionStorage.setItem(STORAGE_KEY, currentKey);
          const bal = await getWalletBalance().catch(() => null);
          setWallet(currentKey, bal);
          queryClient.invalidateQueries({ queryKey: ['portfolio'] });
          queryClient.invalidateQueries({ queryKey: ['bets'] });
        } else if (!currentKey && walletAddress) {
          disconnect();
        }
      } catch {
        // ignore errors during background check
      }
    };

    if (typeof window !== 'undefined') {
      interval = setInterval(checkFreighter, 2000);
      window.addEventListener('focus', checkFreighter);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', checkFreighter);
      }
    };
  }, [walletAddress, disconnect, setWallet]);

  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);
    useAppStore.setState({ isConnecting: true });
    try {
      const address = await connectWallet();
      const balance = await getWalletBalance();
      sessionStorage.setItem(STORAGE_KEY, address);
      setWallet(address, balance);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
      useAppStore.setState({ isConnecting: false });
    }
  }, [setIsConnecting, setWallet]);

  const connectByType = useCallback(async (type: WalletType) => {
    setError(null);
    setIsConnecting(true);
    useAppStore.setState({ isConnecting: true });
    try {
      const address = await connectWalletByType(type);
      const balance = await getWalletBalance();
      sessionStorage.setItem(STORAGE_KEY, address);
      setWallet(address, balance);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
      useAppStore.setState({ isConnecting: false });
    }
  }, [setIsConnecting, setWallet]);

  return {
    address: walletAddress,
    balance: walletBalance,
    isConnected: !!walletAddress,
    isConnecting,
    error,
    connect,
    connectByType,
    disconnect,
    availableWallets,
  };
}
