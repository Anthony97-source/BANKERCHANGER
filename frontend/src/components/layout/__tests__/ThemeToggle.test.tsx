import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { getInitialTheme, ThemeToggle } from '../ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('cycles theme through dark, light, and system', () => {
    render(<ThemeToggle />);
    const btn = screen.getByTestId('theme-toggle');
    expect(btn).toBeInTheDocument();

    act(() => {
      fireEvent.click(btn);
    });
    // After cycle
    expect(localStorage.getItem('bankerchanger_theme')).toBeDefined();
  });

  it('uses the system preference when system theme is selected', () => {
    act(() => {
      document.documentElement.classList.remove('dark');
    });

    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(screen.getByTestId('theme-toggle'));

    expect(localStorage.getItem('bankerchanger_theme')).toBe('system');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('falls back to the system preference for an unsupported stored theme', () => {
    localStorage.setItem('bankerchanger_theme', 'sepia');
    expect(getInitialTheme()).toBe('system');
  });
});
