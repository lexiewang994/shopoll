import { describe, expect, it } from "vitest";
import { PURCHASE_MOTIVATION_TEMPLATE } from "../../app/data";
import {
  evaluateStoredAudience,
  mergePixelHistoryContext,
  normalizeClientAnswer,
  rewardConfiguration,
  rewardForSession,
} from "../../app/services/runtime/public-surveys.server";
import { isReportDue } from "../../app/services/runtime/jobs.server";

describe("stored audience rules", () => {
  it("supports one-level OR groups combined as required groups", () => {
    const rows = [
      { id: "r1", groupIndex: 0, groupJoin: "OR", field: "locale", operator: "equals", value: "en" },
      { id: "r2", groupIndex: 0, groupJoin: "OR", field: "locale", operator: "equals", value: "de" },
      { id: "r3", groupIndex: 1, groupJoin: "AND", field: "orderAmount", operator: "greater_than_or_equal", value: 500 },
    ];
    expect(evaluateStoredAudience(rows, { locale: "de", orderAmount: 799 })).toBe(true);
    expect(evaluateStoredAudience(rows, { locale: "es", orderAmount: 799 })).toBe(false);
    expect(evaluateStoredAudience(rows, { locale: "de", orderAmount: 200 })).toBe(false);
  });

  it("merges consented pixel cart and UTM history into targeting context", () => {
    expect(mergePixelHistoryContext(
      {
        analyticsAllowed: true,
        cartProductIds: ["gid://shopify/Product/1"],
        utm: { utm_source: "current" },
      },
      [
        {
          eventType: "product_added_to_cart",
          payload: { productGid: "gid://shopify/Product/2" },
        },
        {
          eventType: "page_viewed",
          payload: { utmSource: "older", utmMedium: "email" },
        },
      ],
    )).toMatchObject({
      cartProductIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
      utm: { utm_source: "current", utm_medium: "email" },
    });
  });
});

describe("published reward configuration", () => {
  it("uses the 14 day non-stacking reward default", () => {
    const definition = {
      ...PURCHASE_MOTIVATION_TEMPLATE,
      metadata: {
        ...PURCHASE_MOTIVATION_TEMPLATE.metadata,
        rewardEnabled: true,
        rewardType: "percentage",
        rewardValue: 10,
      },
    };
    expect(rewardConfiguration(definition)).toEqual({
      type: "PERCENTAGE",
      value: 10,
      minimumSubtotal: undefined,
      validForDays: 14,
      appliesToProductIds: undefined,
      productScope: "core_products",
      combinesWithShipping: false,
      anonymousRiskAcknowledged: false,
      maximumShippingPrice: undefined,
    });
  });

  it("rejects invalid values before a published reward reaches Shopify", () => {
    const definition = {
      ...PURCHASE_MOTIVATION_TEMPLATE,
      metadata: {
        ...PURCHASE_MOTIVATION_TEMPLATE.metadata,
        rewardEnabled: true,
        rewardType: "percentage",
        rewardValue: 101,
      },
    };
    expect(() => rewardConfiguration(definition)).toThrow(
      "Percentage reward must be greater than 0 and at most 100",
    );
  });

  it("normalizes free shipping, subtotal, expiry and combination settings", () => {
    const definition = {
      ...PURCHASE_MOTIVATION_TEMPLATE,
      metadata: {
        ...PURCHASE_MOTIVATION_TEMPLATE.metadata,
        rewardEnabled: true,
        rewardType: "free_shipping",
        rewardValue: 30,
        rewardMinimumSubtotal: 100,
        rewardValidForDays: 21,
        rewardProductScope: "all_products",
        rewardCombinesShipping: true,
        rewardAnonymousRisk: true,
      },
    };
    expect(rewardConfiguration(definition)).toMatchObject({
      type: "FREE_SHIPPING",
      minimumSubtotal: "100",
      validForDays: 21,
      productScope: "all_products",
      combinesWithShipping: true,
      anonymousRiskAcknowledged: true,
      maximumShippingPrice: "30",
    });
  });

  it("deduplicates order-backed invites by order before invite ID", () => {
    const config = rewardConfiguration({
      ...PURCHASE_MOTIVATION_TEMPLATE,
      metadata: {
        ...PURCHASE_MOTIVATION_TEMPLATE.metadata,
        rewardEnabled: true,
        rewardType: "percentage",
        rewardValue: 10,
        rewardProductScope: "all_products",
      },
    });
    expect(config).not.toBeNull();
    const first = rewardForSession(config!, {
      shopDomain: "shop.harborinno.com",
      inviteId: "invite-one",
      orderGidHash: "same-order",
      surface: "KLAVIYO_EMAIL",
      productFacts: [],
    });
    const second = rewardForSession(config!, {
      shopDomain: "shop.harborinno.com",
      inviteId: "invite-two",
      orderGidHash: "same-order",
      surface: "KLAVIYO_SMS",
      productFacts: [],
    });
    expect(first?.eligibilityKey).toBe(second?.eligibilityKey);
  });
});

describe("extension answer normalization", () => {
  it("normalizes scale controls and consent-bound contact values", () => {
    const nps = {
      id: "nps",
      kind: "nps" as const,
      title: { en: "Score" },
    };
    expect(normalizeClientAnswer(nps, "10")).toBe(10);

    const contact = {
      id: "email",
      kind: "contact" as const,
      title: { en: "Email" },
      collect: ["email" as const],
      consentText: { en: "I agree" },
    };
    expect(normalizeClientAnswer(contact, { value: "person@example.com", consent: true })).toEqual({
      email: "person@example.com",
      consent: true,
    });
  });
});

describe("weekly report scheduling", () => {
  it("evaluates the configured shop timezone instead of server UTC", () => {
    const mondayOneAmUtc = new Date("2026-07-27T01:00:00Z");
    expect(isReportDue({ timezone: "Asia/Shanghai", weekday: 1, hour: 9 }, mondayOneAmUtc)).toBe(true);
    expect(isReportDue({ timezone: "America/Los_Angeles", weekday: 1, hour: 9 }, mondayOneAmUtc)).toBe(false);
  });
});
