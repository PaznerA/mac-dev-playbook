import { type Page, expect } from '@playwright/test';

/**
 * Logs into Authentik SSO if the page redirects to auth.dev.local.
 * Idempotent — if already authenticated (session cookie present), does nothing.
 *
 * Required env:
 *   AUTHENTIK_USER (default: akadmin)
 *   AUTHENTIK_PASSWORD
 *
 * Returns true if login was performed, false if already authenticated.
 */
export async function loginAuthentik(page: Page): Promise<boolean> {
  const url = page.url();
  if (!url.includes('auth.') && !url.includes('/flows/')) {
    return false;
  }

  const username = process.env.AUTHENTIK_USER || 'akadmin';
  const password = process.env.AUTHENTIK_PASSWORD;
  if (!password) {
    throw new Error('AUTHENTIK_PASSWORD env var is required for SSO login');
  }

  // Authentik default-authentication-flow: identification stage first
  const identifyField = page.locator('input[name="uidField"], input[name="username"], input[type="email"]').first();
  await expect(identifyField).toBeVisible({ timeout: 10_000 });
  await identifyField.fill(username);

  const nextBtn = page.locator('button[type="submit"]').first();
  await nextBtn.click();

  // Password stage
  const passwordField = page.locator('input[type="password"]').first();
  await expect(passwordField).toBeVisible({ timeout: 10_000 });
  await passwordField.fill(password);
  await page.locator('button[type="submit"]').first().click();

  // Wait for redirect back to the original app
  await page.waitForURL((u) => !u.toString().includes('auth.') && !u.toString().includes('/flows/'), {
    timeout: 15_000,
  });
  return true;
}

/**
 * Navigates to a URL and handles Authentik SSO redirect if triggered.
 */
export async function gotoWithAuth(page: Page, targetUrl: string): Promise<void> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  // Authentik redirect lands on /flows/... or on auth.<domain>/
  if (page.url().includes('auth.') || page.url().includes('/flows/')) {
    await loginAuthentik(page);
  }
}
