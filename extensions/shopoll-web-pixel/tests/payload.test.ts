import assert from "node:assert/strict";
import test from "node:test";

import {buildPayload, fixedUtm, pseudonymousId, resolvePixelEndpoint, resolvePixelProxyEndpoint} from "../src/payload";

test("endpoint configuration accepts app origins and full event URLs", () => {
  assert.equal(resolvePixelEndpoint("http://example.com"), "");
  assert.equal(
    resolvePixelEndpoint("https://poll.example"),
    "https://poll.example/api/public/pixel/events",
  );
  assert.equal(
    resolvePixelEndpoint("https://poll.example/api/public/pixel/events"),
    "https://poll.example/api/public/pixel/events",
  );
  assert.equal(
    resolvePixelEndpoint("https://poll.example/api/public"),
    "https://poll.example/api/public/pixel/events",
  );
  assert.equal(resolvePixelEndpoint("https://user@poll.example"), "");
  assert.equal(
    resolvePixelEndpoint("http://localhost:3000"),
    "http://localhost:3000/api/public/pixel/events",
  );
  assert.equal(
    resolvePixelEndpoint("", "https://compiled.example"),
    "https://compiled.example/api/public/pixel/events",
  );
});

test("pixel ingestion only uses the signed storefront app proxy", () => {
  assert.equal(
    resolvePixelProxyEndpoint("", "harbor-dev.myshopify.com"),
    "https://harbor-dev.myshopify.com/apps/shopoll/pixel/events",
  );
  assert.equal(
    resolvePixelProxyEndpoint("https://poll.example", "harbor-dev.myshopify.com"),
    "",
  );
  assert.equal(
    resolvePixelProxyEndpoint("https://harbor-dev.myshopify.com/apps/shopoll", "harbor-dev.myshopify.com"),
    "https://harbor-dev.myshopify.com/apps/shopoll/pixel/events",
  );
  assert.equal(
    resolvePixelProxyEndpoint("https://harbor-dev.myshopify.com/apps/shopoll/api/public", "harbor-dev.myshopify.com"),
    "https://harbor-dev.myshopify.com/apps/shopoll/pixel/events",
  );
});

test("a first-party visitor token overrides the sandbox client identifier", () => {
  const payload = buildPayload(
    {id: "event-1", name: "page_viewed", clientId: "sandbox-client"},
    "harbor-dev.myshopify.com",
    "shared-browser-token",
  );
  assert.equal(payload.event.pseudonymousId, "shared-browser-token");
});

test("visitor IDs are stable per shop but raw IDs are never returned", () => {
  const first = pseudonymousId("raw-client-id", "gid://shopify/Shop/1");
  const second = pseudonymousId("raw-client-id", "gid://shopify/Shop/1");
  assert.equal(first, second);
  assert.ok(first?.startsWith("v1_"));
  assert.ok(!first?.includes("raw-client-id"));
});

test("only fixed UTM parameters are retained", () => {
  assert.deepEqual(
    fixedUtm("?utm_source=reddit&email=customer%40example.com&utm_campaign=launch"),
    {utm_source: "reddit", utm_campaign: "launch"},
  );
});

test("payload strips URL query, titles, referrers, and checkout identity fields", () => {
  const payload = buildPayload(
    {
      id: "event-1",
      name: "checkout_completed",
      clientId: "raw-client-id",
      timestamp: "2026-07-26T12:00:00.000Z",
      context: {
        document: {
          location: {pathname: "/checkouts/thank-you", search: "?utm_medium=email&token=secret"},
        },
        navigator: {language: "de-DE"},
        window: {innerWidth: 390},
      },
      data: {
        checkout: {
          email: "customer@example.com",
          phone: "+10000000000",
          order: {id: "gid://shopify/Order/1"},
          totalPrice: {amount: 99, currencyCode: "USD"},
          lineItems: [
            {
              title: "Secret title",
              quantity: 1,
              variant: {id: "gid://shopify/ProductVariant/2", product: {id: "gid://shopify/Product/3"}},
            },
          ],
        },
      },
    },
    "gid://shopify/Shop/4",
  );
  const serialized = JSON.stringify(payload);
  assert.equal(payload.event.page.path, "/checkouts/thank-you");
  assert.deepEqual(payload.event.page.utm, {utm_medium: "email"});
  assert.ok(!serialized.includes("customer@example.com"));
  assert.ok(!serialized.includes("+10000000000"));
  assert.ok(!serialized.includes("Secret title"));
  assert.ok(!serialized.includes("token"));
  assert.ok(!serialized.includes("raw-client-id"));
});
