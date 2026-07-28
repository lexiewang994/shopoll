import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const localPort = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "npm run dev:web -- --host 127.0.0.1",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: localPort,
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/shopoll",
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "shopoll_local_dev",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || "shopoll_local_dev_secret_shopoll_local_dev_secret",
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || baseURL,
      SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN || "harbor-dev.myshopify.com",
      SHOP_CUSTOM_DOMAIN: process.env.SHOP_CUSTOM_DOMAIN || "shop.harborinno.com",
      SCOPES: process.env.SCOPES || "read_products,read_orders,read_discounts,write_discounts,read_fulfillments,write_pixels,read_customer_events,write_app_proxy",
      DEMO_MODE: "true",
    },
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
