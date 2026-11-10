import { test, expect, Page } from '@playwright/test';

/**
 * Screenshot baselines, captured before the button consolidation starts
 * (BUTTON_SYSTEM_SPEC.md, step 1). Their job is to answer one question during
 * the migration: "did this change anything I didn't mean to change?"
 *
 * Replaces the old visual-audit spec, which wrote PNGs to disk and asserted
 * nothing — it could not fail, so it could not catch a regression. It also
 * guarded every step with `if (count > 0)`, so a page that rendered nothing
 * passed quietly, and it pointed at /settings/* routes that do not exist
 * (settings live under /projects/[id]/settings/*).
 *
 * To refresh after an intentional visual change:
 *   npm run test:visual:update
 */

/** Anything whose pixels change between runs for reasons unrelated to styling. */
function volatile(page: Page) {
  return [
    page.locator('[data-testid="relative-time"]'),
    page.locator('time'),
    page.locator('canvas'), // report charts animate and re-layout
    page.locator('img[src*="avatar"], img[src*="googleusercontent"]'),
  ];
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Covers transitions that start on mount and outlast networkidle.
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
    mask: volatile(page),
  });
}

/**
 * The id of the first project. Resolved through the UI rather than the API so
 * the suite doesn't depend on an endpoint shape, and read off the card's
 * data-project-id (added for this suite) rather than a style-based selector.
 */
async function firstProjectId(page: Page): Promise<string> {
  await page.goto('/projects');
  await settle(page);
  const card = page.locator('[data-testid="project-card"]').first();
  await expect(
    card,
    'No project found. The visual baselines need an account with at least one project.',
  ).toBeVisible({ timeout: 15_000 });
  const id = await card.getAttribute('data-project-id');
  expect(id, 'project card is missing data-project-id').toBeTruthy();
  return id!;
}

test.describe('visual baselines', () => {
  test('login page', async ({ page }) => {
    // The one page that must be seen logged out.
    await page.context().clearCookies();
    await page.goto('/login');
    await shot(page, 'login');
  });

  test('dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await shot(page, 'dashboard');
  });

  test('projects list', async ({ page }) => {
    await page.goto('/projects');
    await shot(page, 'projects');
  });

  test('standup', async ({ page }) => {
    await page.goto('/standup');
    await shot(page, 'standup');
  });

  test('project timeline', async ({ page }) => {
    await page.goto('/projects/timeline');
    await shot(page, 'projects-timeline');
  });

  test('board', async ({ page }) => {
    const id = await firstProjectId(page);
    await page.goto(`/projects/${id}/board`);
    await shot(page, 'board');
  });

  test('backlog', async ({ page }) => {
    const id = await firstProjectId(page);
    await page.goto(`/projects/${id}/backlog`);
    await shot(page, 'backlog');
  });

  test('epics', async ({ page }) => {
    const id = await firstProjectId(page);
    await page.goto(`/projects/${id}/epics`);
    await shot(page, 'epics');
  });

  // Settings pages are the densest cluster of design-system Buttons, so they are
  // where the padding fix and the coming migration are most likely to show.
  for (const tab of ['general', 'workflow', 'labels'] as const) {
    test(`project settings - ${tab}`, async ({ page }) => {
      const id = await firstProjectId(page);
      await page.goto(`/projects/${id}/settings/${tab}`);
      await shot(page, `settings-${tab}`);
    });
  }

  // A modal footer: the exact primary/secondary CTA pair the migration targets.
  test('create sprint modal', async ({ page }) => {
    const id = await firstProjectId(page);
    await page.goto(`/projects/${id}/backlog`);
    await settle(page);

    const trigger = page.getByRole('button', { name: /create sprint/i }).first();
    await expect(
      trigger,
      'No "Create sprint" button on the backlog — update this selector if the backlog changed.',
    ).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const dialog = page.locator('form, [role="dialog"]').last();
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot('modal-create-sprint.png', {
      animations: 'disabled',
      mask: volatile(page),
    });
  });
});
