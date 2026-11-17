import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const SYSTEM_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CACHED_CHROMIUM_1223_PATH =
  'C:\\Users\\sklei\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

const hasSystemChrome = fs.existsSync(SYSTEM_CHROME_PATH);
const hasCachedChromium = fs.existsSync(CACHED_CHROMIUM_1223_PATH);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: hasSystemChrome
        ? { channel: 'chrome' }
        : hasCachedChromium
          ? { launchOptions: { executablePath: CACHED_CHROMIUM_1223_PATH } }
          : {},
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
