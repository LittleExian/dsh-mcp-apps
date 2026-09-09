import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,
  use:{baseURL:'http://127.0.0.1:43187',channel:'chrome',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node scripts/build.mjs --demo && node .demo/server.js',url:'http://127.0.0.1:43187',reuseExistingServer:false,timeout:30_000},
})
