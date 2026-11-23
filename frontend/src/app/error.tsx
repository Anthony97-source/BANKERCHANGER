'use client';

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps): JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const reloadPage = (): void => {
    window.location.reload();
  };

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Something went wrong
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-lg">
        An unexpected error occurred. Please reload the page or try again.
      </p>
      {error.message && (
        <p
          role="alert"
          className="mb-6 max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
        >
          {error.message}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={reloadPage}
          className="min-h-[44px] bg-amber-500 hover:bg-amber-400 text-black font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
