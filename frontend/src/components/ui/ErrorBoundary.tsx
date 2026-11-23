'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="mx-auto max-w-lg mt-20 px-4 text-center space-y-4"
          >
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Something went wrong
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              We could not load this part of the page. Please try again or reload.
            </p>
            {this.state.error?.message && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {this.state.error.message}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-sm"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={this.handleRetry}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 font-semibold text-gray-900 dark:text-white text-sm"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback, onReset }: Props): JSX.Element {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundaryInner
          fallback={fallback}
          onReset={() => {
            reset();
            onReset?.();
          }}
        >
          {children}
        </ErrorBoundaryInner>
      )}
    </QueryErrorResetBoundary>
  );
}
