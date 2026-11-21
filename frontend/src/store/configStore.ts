import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Network = 'mainnet' | 'testnet' | 'futurenet';
export type Theme = 'light' | 'dark' | 'system';

export interface ConfigState {
  network: Network;
  theme: Theme;
  notifications: boolean;
  setNetwork: (network: Network) => void;
  setTheme: (theme: Theme) => void;
  setNotifications: (notifications: boolean) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      network: 'testnet',
      theme: 'system',
      notifications: true,
      setNetwork: (network) => set({ network }),
      setTheme: (theme) => set({ theme }),
      setNotifications: (notifications) => set({ notifications }),
    }),
    {
      name: 'app-config',
      partialize: (state) => ({
        network: state.network,
        theme: state.theme,
        notifications: state.notifications,
      }),
    }
  )
);
