import type { ReactNode } from 'react';

const toast = {
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warning: () => undefined,
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}

export function useToast() {
  return toast;
}

export function useOptionalToast() {
  return toast;
}
