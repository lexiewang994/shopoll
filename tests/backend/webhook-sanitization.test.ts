import { describe, expect, it } from "vitest";
import {
  applyProductMappings,
  exactCoreProductKey,
  klaviyoInviteRequestDigest,
  sanitizeFulfillment,
  sanitizeShopifyOrder,
} from "../../app/services/runtime/webhooks.server";
import {
  HARBOR_CORE_PRODUCTS,
  matchHarborCoreProducts,
} from "../../app/services/provision-shop.server";

describe("Shopify webhook sanitization", () => {
  it("binds Klaviyo invite idempotency to the full normalized request", () => {
    const request = {
      shopDomain: "shop.harborinno.com",
      surveyVersionId: "version-1",
      placementId: "placement-1",
      surface: "KLAVIYO_EMAIL" as const,
      profileId: "profile-1",
      profileEmailHash: "email-hash",
      orderGidHash: "order-hash",
      productFacts: [{ productGid: "gid://shopify/Product/1", quantity: 1 }],
      locale: "en",
      flowHash: "flow-hash",
      expiresInDays: 14,
    };
    const digest = klaviyoInviteRequestDigest(request);

    expect(klaviyoInviteRequestDigest({ ...request })).toBe(digest);
    expect(klaviyoInviteRequestDigest({ ...request, surface: "KLAVIYO_SMS" })).not.toBe(digest);
    expect(klaviyoInviteRequestDigest({ ...request, orderGidHash: "other-order" })).not.toBe(digest);
    expect(klaviyoInviteRequestDigest({ ...request, locale: "de" })).not.toBe(digest);
    expect(klaviyoInviteRequestDigest({ ...request, expiresInDays: 30 })).not.toBe(digest);
  });

  it("keeps commerce facts and drops all customer contact/address fields", () => {
    const fact = sanitizeShopifyOrder({
      id: 42,
      confirmation_number: "HARBOR42",
      created_at: "2026-07-20T12:00:00Z",
      current_total_price: "799.00",
      currency: "USD",
      customer_locale: "en-US",
      customer: {
        id: 999,
        email: "private@example.com",
        first_name: "Private",
        orders_count: 1,
      },
      shipping_address: { address1: "Sensitive street" },
      landing_site: "/products/paper7?utm_source=launch&utm_campaign=july",
      source_name: "web",
      line_items: [{
        product_id: 11,
        variant_id: 12,
        title: "Paper7 tablet",
        sku: "PAPER7-BLK",
        quantity: 1,
        price: "799.00",
      }],
      discount_codes: [{ code: "LAUNCH" }],
    });

    expect(fact).toMatchObject({
      orderGid: "gid://shopify/Order/42",
      confirmationNumber: "HARBOR42",
      amount: "799.00",
      currency: "USD",
      customerOrderIndex: 1,
      isFirstOrder: true,
      source: "web",
      productFacts: [{
        productGid: "gid://shopify/Product/11",
        variantGid: "gid://shopify/ProductVariant/12",
        quantity: 1,
      }],
      utm: { utm_source: "launch", utm_campaign: "july" },
      discountCodes: ["LAUNCH"],
    });
    const serialized = JSON.stringify(fact);
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("Sensitive street");
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("999");
  });

  it("enriches core products only from exact persisted GID or handle mappings", () => {
    const mappings = [
      {
        productKey: "paper7",
        productGid: "gid://shopify/Product/11",
        handle: HARBOR_CORE_PRODUCTS[0].handle,
        isCore: true,
      },
      {
        productKey: "nexus",
        productGid: "gid://shopify/Product/30",
        handle: HARBOR_CORE_PRODUCTS[2].handle,
        isCore: true,
      },
    ];
    expect(applyProductMappings([
      { productGid: "gid://shopify/Product/11", quantity: 1 },
      { handle: HARBOR_CORE_PRODUCTS[2].handle, quantity: 1 },
      { productGid: "gid://shopify/Product/99", handle: "nexus-cable", productKey: "Nexus cable" },
    ], mappings)).toEqual([
      { productGid: "gid://shopify/Product/11", quantity: 1, productKey: "paper7" },
      { handle: HARBOR_CORE_PRODUCTS[2].handle, quantity: 1, productKey: "nexus" },
      { productGid: "gid://shopify/Product/99", handle: "nexus-cable" },
    ]);
  });

  it("does not classify accessory or descriptive titles by substring", () => {
    expect(exactCoreProductKey("Nexus cable")).toBeUndefined();
    expect(exactCoreProductKey("Paper7 case")).toBeUndefined();
    expect(exactCoreProductKey("Bricbloc gift wrap")).toBeUndefined();
    expect(exactCoreProductKey("Nexus AI Station")).toBe("nexus");

    const fact = sanitizeShopifyOrder({
      id: 44,
      created_at: "2026-07-20T12:00:00Z",
      total_price: "25",
      currency: "USD",
      line_items: [
        { product_id: 91, title: "Nexus cable", quantity: 1, price: "10" },
        { product_id: 92, title: "Paper7 case", quantity: 1, price: "15" },
      ],
    });
    expect(fact.productFacts.every((row) => row.productKey === undefined)).toBe(true);
  });

  it("matches Shopify catalog products by exact configured or stored identity", () => {
    const matches = matchHarborCoreProducts([
      {
        id: "gid://shopify/Product/recreated-paper7",
        handle: HARBOR_CORE_PRODUCTS[0].handle,
        title: "Paper 7 current title",
      },
      {
        id: "gid://shopify/Product/stored-bricbloc",
        handle: "renamed-bricbloc",
        title: "Bricbloc current title",
      },
      {
        id: "gid://shopify/Product/accessory",
        handle: "nexus-ai-station-cable",
        title: "Nexus cable",
      },
    ], [{
      productKey: "bricbloc",
      productGid: "gid://shopify/Product/stored-bricbloc",
      handle: HARBOR_CORE_PRODUCTS[1].handle,
    }]);

    expect(matches.map((match) => [match.productKey, match.id, match.handle])).toEqual([
      ["paper7", "gid://shopify/Product/recreated-paper7", HARBOR_CORE_PRODUCTS[0].handle],
      ["bricbloc", "gid://shopify/Product/stored-bricbloc", "renamed-bricbloc"],
    ]);
  });

  it("reduces fulfillment payloads to order and delivery state", () => {
    expect(sanitizeFulfillment({
      id: 7,
      order_id: 42,
      status: "success",
      shipment_status: "delivered",
      updated_at: "2026-07-25T08:00:00Z",
      destination: { name: "Do not retain", address1: "Do not retain" },
    })).toEqual({
      orderGid: "gid://shopify/Order/42",
      fulfillment: {
        fulfillmentGid: "gid://shopify/Fulfillment/7",
        status: "success",
        shipmentStatus: "delivered",
        updatedAt: "2026-07-25T08:00:00Z",
      },
    });
  });

  it("strips query parameters from referring sources and drops PII-like UTM values", () => {
    const fact = sanitizeShopifyOrder({
      id: 43,
      created_at: "2026-07-20T12:00:00Z",
      total_price: "10",
      currency: "USD",
      referring_site: "https://example.com/review?email=private@example.com",
      landing_site: "/?utm_source=private@example.com&utm_campaign=launch",
      line_items: [],
    });
    expect(fact.source).toBe("example.com/review");
    expect(fact.utm).toEqual({ utm_campaign: "launch" });
    expect(JSON.stringify(fact)).not.toContain("private@example.com");
  });
});
