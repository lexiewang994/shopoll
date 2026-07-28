import { describe, expect, it } from "vitest";
import { PURCHASE_MOTIVATION_TEMPLATE } from "../../app/data";
import {
  canonicalJson,
  coreProductsFromFacts,
  deterministicOpaqueToken,
  publicSurveyDefinition,
  sanitizedPublicContext,
  toAudienceContext,
} from "../../app/services/runtime/common.server";

describe("backend persistence boundary", () => {
  it("canonicalizes objects for stable idempotency digests", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("does not retain cross-page identifiers without analytics consent", () => {
    const context = sanitizedPublicContext({
      surface: "theme",
      mode: "popup",
      visitorToken: "raw-visitor",
      analyticsAllowed: false,
      locale: "de-DE",
      page: { type: "product", path: "/products/paper7", productGid: "gid://shopify/Product/1" },
      utm: { utm_source: "private@example.com" },
    }, "THEME_POPUP");

    expect(context).toMatchObject({
      surface: "theme_popup",
      locale: "de-DE",
      pageType: "product",
      path: "/products/paper7",
      analyticsConsent: false,
    });
    expect(JSON.stringify(context)).not.toContain("raw-visitor");
    expect(context).not.toHaveProperty("utmSource");
    expect(toAudienceContext({
      analyticsAllowed: false,
      cartProductIds: ["gid://shopify/Product/2"],
      utm: { utm_source: "newsletter" },
    }, "THEME_POPUP")).toMatchObject({
      analyticsConsent: false,
      cartProductIds: undefined,
      utmSource: undefined,
    });
  });

  it("derives stable 256-bit resume material without storing the raw token", () => {
    const first = deterministicOpaqueToken("response-session", "dedupe-1");
    expect(first).toHaveLength(43);
    expect(deterministicOpaqueToken("response-session", "dedupe-1")).toBe(first);
    expect(deterministicOpaqueToken("response-session", "dedupe-2")).not.toBe(first);
  });

  it("uses signed order facts instead of caller-supplied commerce attribution", () => {
    const raw = {
      market: "spoofed-market",
      locale: "es",
      source: "spoofed-source",
      discountCodes: ["SPOOFED"],
      utm: { utm_source: "spoofed-utm" },
    };
    const orderFact = {
      market: "DE",
      locale: "de-DE",
      source: "shopify-web",
      discountCodes: ["WELCOME"],
      utm: { utm_source: "trusted-campaign" },
    };
    expect(toAudienceContext(raw, "THANK_YOU", orderFact)).toMatchObject({
      market: "DE",
      locale: "de-DE",
      source: "shopify-web",
      discountCodes: ["WELCOME"],
      utmSource: "trusted-campaign",
    });
    expect(sanitizedPublicContext(raw, "THANK_YOU", orderFact)).toMatchObject({
      market: "DE",
      locale: "de-DE",
    });
    expect(JSON.stringify(sanitizedPublicContext(raw, "THANK_YOU", orderFact)))
      .not.toContain("spoofed");
  });
});

describe("Harbor product routing", () => {
  it("recognizes unique core products and ignores accessories", () => {
    expect(coreProductsFromFacts([
      { productKey: "paper7", productGid: "gid://shopify/Product/1" },
      { productKey: "usb-c-cable" },
      { title: "Nexus AI Station", productGid: "gid://shopify/Product/3" },
      { title: "Paper7 case", productGid: "gid://shopify/Product/4" },
      { title: "Nexus cable", productGid: "gid://shopify/Product/5" },
    ])).toEqual([
      { key: "paper7", productGid: "gid://shopify/Product/1" },
      { key: "nexus", productGid: "gid://shopify/Product/3" },
    ]);
  });

  it("projects a single-product purchase survey without the product chooser", () => {
    const projected = publicSurveyDefinition(PURCHASE_MOTIVATION_TEMPLATE, "de-DE", {
      autoCoreProduct: "paper7",
    });
    const questions = projected.questions as Array<{ id: string; title: string }>;
    expect(questions.some((question) => question.id === "core_product")).toBe(false);
    expect(questions.some((question) => question.id === "paper7_reason")).toBe(true);
    expect(questions.some((question) => question.id === "nexus_reason")).toBe(false);
    expect(questions.find((question) => question.id === "paper7_reason")?.title).toContain("Paper7");
  });

  it("preserves configurable CSAT and star-rating ranges in the public contract", () => {
    const projected = publicSurveyDefinition({
      ...PURCHASE_MOTIVATION_TEMPLATE,
      questions: [
        ...PURCHASE_MOTIVATION_TEMPLATE.questions,
        { id: "csat_7", kind: "csat" as const, title: { en: "CSAT" }, scale: 7 as const },
        { id: "stars_10", kind: "star_rating" as const, title: { en: "Rating" }, stars: 10 as const },
        { id: "details", kind: "short_text" as const, title: { en: "Details" }, placeholder: { en: "Type here" } },
        { id: "contact", kind: "contact" as const, title: { en: "Contact" }, collect: ["email" as const, "phone" as const], consentText: { en: "I agree" } },
      ],
      metadata: { accentColor: "#123456", borderRadius: 8, density: "compact", showBrand: false },
    }, "en");
    const questions = projected.questions as Array<{ id: string; scale?: number; stars?: number; placeholder?: string; collect?: string[] }>;
    expect(questions.find((question) => question.id === "csat_7")?.scale).toBe(7);
    expect(questions.find((question) => question.id === "stars_10")?.stars).toBe(10);
    expect(questions.find((question) => question.id === "details")?.placeholder).toBe("Type here");
    expect(questions.find((question) => question.id === "contact")?.collect).toEqual(["email", "phone"]);
    expect(projected.style).toEqual({
      accentColor: "#123456",
      borderRadius: 8,
      density: "compact",
      showBrand: false,
    });
  });
});
