import { test, expect, request } from '@playwright/test';
import { gotoWithAuth } from '../fixtures/authentik';

test.describe('Glasswing Hub — smoke', () => {
  test('GET /api/v1/hub/services returns registry JSON', async () => {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true });
    const res = await ctx.get('/api/v1/hub/services');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('services');
    expect(Array.isArray(body.services)).toBe(true);
    // Expect at least a couple of core services (MariaDB, PostgreSQL, etc.)
    expect(body.services.length).toBeGreaterThan(0);
    // Every service must have a name
    for (const svc of body.services) {
      expect(svc).toHaveProperty('name');
    }
    await ctx.dispose();
  });

  test('GET /api/v1/hub/health probes every service', async () => {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true });
    const res = await ctx.get('/api/v1/hub/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('probes');
    expect(Array.isArray(body.probes)).toBe(true);
    for (const probe of body.probes) {
      expect(probe).toHaveProperty('url');
      expect(probe).toHaveProperty('status');
      expect(['up', 'down', 'skipped']).toContain(probe.status);
    }
    await ctx.dispose();
  });

  test('/hub renders grid after SSO login', async ({ page }) => {
    test.skip(!process.env.AUTHENTIK_PASSWORD, 'AUTHENTIK_PASSWORD not set — skipping authenticated smoke');
    await gotoWithAuth(page, '/hub');
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.locator('#hub-grid')).toBeVisible();
    // At least one card should render
    const cards = page.locator('.hub-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('public homepage loads without auth', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Glasswing');
    // The login button should be visible
    await expect(page.getByRole('link', { name: /prihlasit/i })).toBeVisible();
  });
});
