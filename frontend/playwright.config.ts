import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const STORAGE_STATE = path.join(__dirname, 'tests', '.auth', 'user.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Baselines are only comparable at a fixed size.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },

  expect: {
    toHaveScreenshot: {
      // Font antialiasing differs enough between machines to trip an exact
      // match; this absorbs that without hiding a real layout or colour change.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
