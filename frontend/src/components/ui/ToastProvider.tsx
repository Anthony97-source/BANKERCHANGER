'use client';

import { createContext, useCallback, useContext, useRef, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const STYLES: Record<ToastType, string> = {
  success: 'border-green-500/40 text-green-300',
  error: 'border-red-500/40 text-red-300',
  info: 'border-blue-500/40 text-blue-300',
};

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-blue-400',
};

const TYPE_LABELS: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Information',
};

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      // Dismiss transient error toasts on route change
      setToasts((prev) => prev.filter((t) => t.type !== 'error'));
    }
  }, [pathname]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastType, message: string) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    success: (msg) => add('success', msg),
    error: (msg) => add('error', msg),
    info: (msg) => add('info', msg),
  };

  const infoToasts = toasts.filter((t) => t.type !== 'error');
  const errorToasts = toasts.filter((t) => t.type === 'error');

  const renderToast = (toast: Toast) => (
    <div
      key={toast.id}
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 bg-gray-900 border rounded-xl shadow-xl px-4 py-3 ${STYLES[toast.type]}`}
    >
      <span
        aria-hidden="true"
        className={`text-lg leading-none mt-0.5 ${ICON_STYLES[toast.type]}`}
      >
        {ICONS[toast.type]}
      </span>
      <p className="flex-1 text-sm text-white">
        <span className="sr-only">{TYPE_LABELS[toast.type]}: </span>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={`Dismiss ${TYPE_LABELS[toast.type].toLowerCase()} notification: ${toast.message}`}
        className="text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region for success/info toasts */}
      <div
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {infoToasts.map(renderToast)}
      </div>
      {/* Assertive live region for error toasts */}
      <div
        aria-live="assertive"
        aria-atomic="false"
        aria-relevant="additions text"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {errorToasts.map(renderToast)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}
