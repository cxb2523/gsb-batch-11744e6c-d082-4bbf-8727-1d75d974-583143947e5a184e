import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json');

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Signs in once and saves the session, so the visual specs don't pay for a login
 * per test.
 *
 * Nothing is hardcoded: this project has no fixed seed account — scripts/init_db.py
 * takes whatever email and password you give it at first run — and the stored
 * password is a bcrypt hash, so it cannot be read back out of the database.
 *
 * Two ways in, whichever you have:
 *
 *   E2E_EMAIL=you@example.com E2E_PASSWORD='...'            npm run test:visual
 *   E2E_EMAIL=you@example.com E2E_DEV_PASSWORD='...'        npm run test:visual
 *
 * The second uses POST /auth/dev-login with the shared local dev password
 * (APP_DEV_LOGIN_PASSWORD in backend/.env). That endpoint is fail-closed:
 * it 404s unless the backend is in `development` on localhost.
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const devPassword = process.env.E2E_DEV_PASSWORD;

  if (!email || (!password && !devPassword)) {
    throw new Error(
      'Visual baselines need an account to sign in as.\n' +
        '  E2E_EMAIL=you@example.com E2E_PASSWORD=\'...\'     npm run test:visual\n' +
        '  E2E_EMAIL=you@example.com E2E_DEV_PASSWORD=\'...\' npm run test:visual   (local dev only)\n' +
        'E2E_DEV_PASSWORD is APP_DEV_LOGIN_PASSWORD from backend/.env.',
    );
  }

  if (password) {
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
  } else {
    // The session cookie is set on host `localhost`, which the browser then sends
    // to the frontend on :3000 as well — cookies ignore the port.
    const res = await page.request.post(`${API}/auth/dev-login`, {
      data: { email, password: devPassword },
    });
    expect(
      res.status(),
      res.status() === 404
        ? 'POST /auth/dev-login returned 404 — it is disabled unless the backend ' +
            'runs in `development` on localhost with APP_DEV_LOGIN_PASSWORD set.'
        : 'dev-login rejected these credentials.',
    ).toBe(200);
    await page.goto('/dashboard');
  }

  // A failed sign-in otherwise shows up as a dozen screenshots of the login page
  // rather than as one clear failure here.
  await expect(page).toHaveURL(/\/(dashboard|projects)/, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
