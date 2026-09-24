import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: true,
  use: { baseURL: process.env.APP_URL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.APP_URL ? undefined : { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grep: /@cross-browser/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-mobile', grep: /@cross-browser/, use: { ...devices['iPhone 13'] } },
  ],
});
