import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'frontend.public-catalog.test.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  reporter: [['list'], ['json', { outputFile: '../.local/public-catalog-browser-results.json' }]],
  use: {
    baseURL: 'http://localhost:8082',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    cwd: process.cwd(),
    command: 'node scripts/storefront-preview.mjs',
    url: 'http://localhost:8082',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
