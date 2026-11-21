'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { WalletButton } from './WalletButton';
import { ThemeToggle } from './ThemeToggle';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const BANNER_KEY = 'bankerchanger_mainnet_banner_dismissed';

const NAV_LINKS: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: '/', label: 'Home' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/create', label: 'Create', adminOnly: true },
];

export function Header(): JSX.Element {
  const pathname = usePathname();
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (IS_MAINNET) {
      setBannerDismissed(sessionStorage.getItem(BANNER_KEY) === '1');
    }
  }, []);

  const closeMenu = useCallback((returnFocus = false) => {
    setMenuOpen(false);
    if (returnFocus) {
      menuButtonRef.current?.focus();
    }
  }, []);

  // Close the mobile menu on Escape and return focus to the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenu(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, closeMenu]);

  // Close the mobile menu when navigating to a different route.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Move focus into the drawer when it opens.
  useEffect(() => {
    if (menuOpen) {
      mobileNavRef.current?.querySelector<HTMLElement>('a')?.focus();
    }
  }, [menuOpen]);

  const dismissBanner = () => {
    sessionStorage.setItem(BANNER_KEY, '1');
    setBannerDismissed(true);
  };

  const linkClass = (href: string) =>
    `rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950 hover:text-gray-900 dark:hover:text-white ${pathname === href ? 'text-gray-900 dark:text-white font-semibold border-b-2 border-amber-500 pb-0.5' : 'text-gray-600 dark:text-gray-400'}`;

  // Matches /create/page.tsx admin logic
  const connectedAddress =
    typeof window === 'undefined' ? null : sessionStorage.getItem('bankerchanger_wallet_address');
  const adminAddresses = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  const isAdmin = !!connectedAddress && adminAddresses.includes(connectedAddress);

  const visibleNavLinks = NAV_LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <>
      {IS_MAINNET && !bannerDismissed && (
        <div className="bg-red-600 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>⚠️ You are betting with real XLM on mainnet</span>
          <button
            type="button"
            onClick={dismissBanner}
            className="ml-auto text-white/80 hover:text-white font-bold rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-600"
            aria-label="Dismiss mainnet warning"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link
            href="/"
            className="font-black text-amber-500 text-xl tracking-tight rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
          >
            BANKERCHANGER
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-4 text-sm" aria-label="Main navigation">
            {visibleNavLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={linkClass(href)}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Network badge */}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${IS_MAINNET ? 'bg-green-600 text-white' : 'bg-amber-500/20 text-amber-400'}`}
            >
              {IS_MAINNET ? 'MAINNET' : 'TESTNET'}
            </span>

            <ThemeToggle />
            <WalletButton />

            {/* Mobile hamburger */}
            <button
              ref={menuButtonRef}
              type="button"
              className="md:hidden flex items-center justify-center w-11 h-11 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
            >
              <span aria-hidden="true">☰</span>
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {menuOpen && (
          <nav
            ref={mobileNavRef}
            id="mobile-navigation"
            className="md:hidden bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 px-4 py-2 flex flex-col text-sm transition-colors"
            aria-label="Mobile navigation"
          >
            {visibleNavLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => closeMenu()}
                aria-current={pathname === href ? 'page' : undefined}
                className={`flex items-center min-h-[44px] ${linkClass(href)}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
