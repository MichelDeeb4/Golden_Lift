import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'foundation.browser.spec.mjs',
  timeout: 30000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '.local/phase-02-browser.json' }]],
  use: {
    browserName: 'chromium',
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: [
    {
      command: 'node packages/tooling/web-start.mjs erp-web 4300',
      url: 'http://127.0.0.1:4300/api/health',
      reuseExistingServer: false,
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      timeout: 30000,
    },
    {
      command: 'node packages/tooling/web-start.mjs platform-admin 4301',
      url: 'http://127.0.0.1:4301/api/health',
      reuseExistingServer: false,
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      timeout: 30000,
    },
  ],
});
