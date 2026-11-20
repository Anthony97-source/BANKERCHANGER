// ============================================================
// BANKERCHANGER — Root Layout
// Wraps all pages with Header and global providers.
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Header } from '../components/layout/Header';
import { QueryProvider } from '../providers/QueryProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'BANKERCHANGER — Boxing Prediction Markets',
    template: '%s — BANKERCHANGER',
  },
  description: 'Decentralized boxing prediction market powered by Stellar Soroban smart contracts.',
  openGraph: {
    siteName: 'BANKERCHANGER',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" className={inter.className}>
      {/* Inline script runs before paint to set dark/light class — prevents flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('bankerchanger_theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-white min-h-screen transition-colors">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-gray-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 dark:focus:bg-gray-900 dark:focus:text-white"
        >
          Skip to main content
        </a>
        <QueryProvider>
          <ToastProvider>
            <Header />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
            <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-700 dark:text-gray-300">
                <p>&copy; {new Date().getFullYear()} BANKERCHANGER. All rights reserved.</p>
                <nav aria-label="Footer">
                  <ul className="flex items-center gap-4">
                    <li>
                      <Link
                        href="/accessibility"
                        className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Accessibility Statement
                      </Link>
                    </li>
                  </ul>
                </nav>
              </div>
            </footer>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
