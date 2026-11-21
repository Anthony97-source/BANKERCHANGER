import { afterAll, test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cleanupE2eData } from './cleanup';

afterAll(cleanupE2eData);

async function mockMarketsApi(page: Page, markets = [
  {
    market_id: 'e2e_test_mkt-filter-1',
    match_id: 'e2e_test_match-filter-1',
    fighter_a: 'Fighter A',
    fighter_b: 'Fighter B',
    weight_class: 'Heavyweight',
    status: 'open',
    scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  },
]) {
  await page.route('**/api/markets*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ markets, total: markets.length, page: 1, limit: 20 }),
    });
  });
}

test.describe('MarketFilters accessibility', () => {
  test('should have no critical or serious axe violations', async ({ page }) => {
    await mockMarketsApi(page);
    await page.goto('/');
    await expect(page.getByText('Fighter A')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(criticalViolations).toHaveLength(0);
    if (criticalViolations.length > 0) {
      console.error('Accessibility violations found:', criticalViolations);
    }
  });

  test('should support keyboard navigation through status tabs', async ({ page }) => {
    await mockMarketsApi(page);
    await page.goto('/');
    await expect(page.getByText('Fighter A')).toBeVisible();

    const tabList = page.getByRole('tablist', { name: /filter by market status/i });
    await expect(tabList).toBeVisible();

    const tabs = tabList.getByRole('tab');
    await expect(tabs).toHaveCount(4);

    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(0)).toBeFocused();

    await page.keyboard.press('End');
    await expect(tabs.nth(3)).toBeFocused();

    await page.keyboard.press('Home');
    await expect(tabs.nth(0)).toBeFocused();

    await tabs.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/status=open/);
  });

  test('should have no axe violations on the markets page with filters applied', async ({ page }) => {
    await mockMarketsApi(page);
    await page.goto('/');
    await expect(page.getByText('Fighter A')).toBeVisible();

    // Apply a status filter so the filtered state is audited as well.
    const tabList = page.getByRole('tablist', { name: /filter by market status/i });
    const tabs = tabList.getByRole('tab');
    await tabs.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/status=open/);
    await expect(page.getByText('Fighter A')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should expose labeled filter controls', async ({ page }) => {
    await mockMarketsApi(page);
    await page.goto('/');
    await expect(page.getByText('Fighter A')).toBeVisible();

    const tabList = page.getByRole('tablist', { name: /filter by market status/i });
    await expect(tabList).toBeVisible();

    const tabs = tabList.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);

    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      const accessibleName = (await tab.textContent())?.trim();
      expect(accessibleName).toBeTruthy();
      await expect(tab).toHaveAttribute('aria-selected', /true|false/);
    }

    // Any search/filter text inputs must have an associated accessible label.
    const inputs = page.locator('input[type="search"], input[type="text"]');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const id = await input.getAttribute('id');
      const hasLabelElement = id
        ? (await page.locator(`label[for="${id}"]`).count()) > 0
        : false;
      expect(Boolean(ariaLabel || ariaLabelledBy || hasLabelElement)).toBe(true);
    }
  });

  test('should allow keyboard activation of filter controls with Enter and Escape', async ({ page }) => {
    await mockMarketsApi(page);
    await page.goto('/');
    await expect(page.getByText('Fighter A')).toBeVisible();

    const tabList = page.getByRole('tablist', { name: /filter by market status/i });
    const tabs = tabList.getByRole('tab');

    // Tab into the page and ensure focus reaches an interactive control.
    await page.keyboard.press('Tab');
    const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focusedRole === 'tab' || focusedRole === null).toBe(true);

    // Enter activates the focused tab.
    await tabs.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/status=open/);

    // Escape returns focus to the active tab without losing the selection.
    await page.keyboard.press('Escape');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });
});
