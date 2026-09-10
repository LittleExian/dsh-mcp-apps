import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/live',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:43187', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build -- --demo && node .demo/server.js',
    url: 'http://127.0.0.1:43187/?app=trending',
    reuseExistingServer: false,
  },
})
