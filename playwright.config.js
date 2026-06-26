'use strict'

const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4000',
  },
  webServer: {
    command: 'npx http-server dest -p 4000 -c-1 --silent',
    port: 4000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
})
