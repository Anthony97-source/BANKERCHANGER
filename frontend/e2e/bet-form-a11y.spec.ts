import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TEST_PUBLIC_KEY = 'GABC1234WXYZ5678GABC1234WXYZ5678GABC1234WXYZ5678GABC1234WXYZ';

const OPEN_MARKET = {
  market_id: 'mkt-a11y-1',
  match_id: 'match-a11y-1',
  fighter_a: 'Fighter Alpha',
  fighter_b: 'Fighter Beta',
  weight_class: 'Lightweight',
  title_fight: false,
  venue: 'Test Arena',
  scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  status: 'open',
  outcome: null,
  pool_a: '100000000',
  pool_b: '100000000',
  pool_draw: '50000000',
  total_pool: '250000000',
  odds_a: 5000,
  odds_b: 5000,
  odds_draw: 2500,
  fee_bps: 200,
  contract_address: 'CTEST_MARKET_CONTRACT',
  factory_address: 'CFACTORY_CONTRACT',
};

async function mockBackend(page: Page) {
  await page.route('**/api/markets*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes(`/api/markets/${OPEN_MARKET.market_id}`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OPEN_MARKET),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ markets: [OPEN_MARKET], total: 1, page: 1, limit: 20 }),
    });
  });

  await page.route(`**/api/markets/${OPEN_MARKET.market_id}/bets`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );
}

async function injectWallet(page: Page) {
  await page.addInitScript((pubKey) => {
    (window as any).freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(pubKey),
      signTransaction: (_xdr: string) => Promise.resolve('SIGNED_XDR'),
      getNetwork: () => Promise.resolve('TESTNET'),
      getNetworkDetails: () =>
        Promise.resolve({
          network: 'TESTNET',
          networkPassphrase: 'Test SDF Network ; September 2015',
          networkUrl: 'https://soroban-testnet.stellar.org',
        }),
    };
  }, TEST_PUBLIC_KEY);
}

async function openBetForm(page: Page) {
  await mockBackend(page);
  await injectWallet(page);
  await page.goto(`/markets/${OPEN_MARKET.market_id}`);
  await page.getByRole('button', { name: /connect wallet/i }).first().click();
  await expect(page.getByText(/GABC.*WXYZ/i)).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: /^place bet$/i })).toBeVisible();
}

test.describe('Bet form accessibility', () => {
  test('should have no critical or serious axe violations', async ({ page }) => {
    await openBetForm(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    if (criticalViolations.length > 0) {
      console.error(
        'A11y violations on bet form:',
        JSON.stringify(criticalViolations, null, 2),
      );
    }

    expect(criticalViolations).toHaveLength(0);
  });

  test('amount input has a programmatically associated label', async ({ page }) => {
    await openBetForm(page);

    // getByLabel only matches when a <label> is linked via htmlFor/id
    // or wraps the input directly.
    const amountInput = page.getByLabel(/amount \(xlm\)/i);
    await expect(amountInput).toBeVisible();
    await expect(amountInput).toHaveAttribute('type', 'number');
    await expect(amountInput).toHaveAttribute('min', '1');
  });

  test('outcome selector exposes a named group with toggle buttons', async ({ page }) => {
    await openBetForm(page);

    const group = page.getByRole('group', { name: /choose your outcome/i });
    await expect(group).toBeVisible();

    // Each outcome button reports its pressed state for assistive tech.
    const fighterButton = group.getByRole('button', { name: /fighter alpha/i });
    await expect(fighterButton).toHaveAttribute('aria-pressed', 'false');
    await fighterButton.click();
    await expect(fighterButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('should have no axe violations across WCAG 2.1 AA rules', async ({ page }) => {
    await openBetForm(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.error(
        'Axe violations on bet form:',
        JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toHaveLength(0);
  });

  test('keyboard navigation: Tab reaches fields and Enter submits', async ({ page }) => {
    await openBetForm(page);

    const amountInput = page.getByLabel(/amount \(xlm\)/i);
    await amountInput.focus();
    await expect(amountInput).toBeFocused();

    // Tab moves focus forward to the next interactive control.
    await page.keyboard.press('Tab');
    const focusedAfterTab = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? el.tagName.toLowerCase() : null;
    });
    expect(focusedAfterTab).not.toBeNull();
    expect(focusedAfterTab).not.toBe('body');

    // Fill the amount and select an outcome, then submit via Enter.
    await amountInput.fill('10');
    await page
      .getByRole('group', { name: /choose your outcome/i })
      .getByRole('button', { name: /fighter alpha/i })
      .click();

    const submitButton = page.getByRole('button', { name: /^place bet$/i });
    await submitButton.focus();
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Enter should trigger the confirmation step (modal or inline confirm).
    await expect(
      page.getByRole('dialog').or(page.getByRole('button', { name: /confirm/i })),
    ).toBeVisible({ timeout: 8000 });
  });

  test('Escape closes the confirmation modal and returns focus', async ({ page }) => {
    await openBetForm(page);

    await page.getByLabel(/amount \(xlm\)/i).fill('10');
    await page
      .getByRole('group', { name: /choose your outcome/i })
      .getByRole('button', { name: /fighter alpha/i })
      .click();
    await page.getByRole('button', { name: /^place bet$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 8000 });
  });

  test('invalid amount is associated with an error message', async ({ page }) => {
    await openBetForm(page);

    const amountInput = page.getByLabel(/amount \(xlm\)/i);
    await amountInput.fill('0');
    await page
      .getByRole('group', { name: /choose your outcome/i })
      .getByRole('button', { name: /fighter alpha/i })
      .click();
    await page.getByRole('button', { name: /^place bet$/i }).click();

    // The input must be flagged invalid for assistive tech.
    await expect(amountInput).toHaveAttribute('aria-invalid', 'true');

    // The error message must be linked via aria-describedby.
    const describedBy = await amountInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const errorMessage = page.locator(`#${describedBy}`);
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).not.toBeEmpty();
  });
});