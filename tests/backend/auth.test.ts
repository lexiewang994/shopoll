import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalShopDomain } from "../../app/services/shop-domain.server";
import { assertConfiguredShopDomain } from "../../app/services/runtime/common.server";
import { assertPublicOrderContext } from "../../app/services/runtime/public-surveys.server";
import {
  orderConfirmationIdentityHash,
  publicRequestIdentity,
} from "../../app/services/security.server";

const original = {
  key: process.env.SHOPIFY_API_KEY,
  secret: process.env.SHOPIFY_API_SECRET,
  demo: process.env.DEMO_MODE,
  nodeEnv: process.env.NODE_ENV,
  shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
};

afterEach(() => {
  if (original.key === undefined) delete process.env.SHOPIFY_API_KEY;
  else process.env.SHOPIFY_API_KEY = original.key;
  if (original.secret === undefined) delete process.env.SHOPIFY_API_SECRET;
  else process.env.SHOPIFY_API_SECRET = original.secret;
  if (original.demo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = original.demo;
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original.nodeEnv;
  if (original.shopDomain === undefined) delete process.env.SHOPIFY_SHOP_DOMAIN;
  else process.env.SHOPIFY_SHOP_DOMAIN = original.shopDomain;
});

function checkoutToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    aud: "shopify-key",
    dest: "https://harbor-test.myshopify.com",
    exp: Math.floor(Date.now() / 1000) + 60,
    sub: "gid://shopify/Customer/1",
  })).toString("base64url");
  const signature = createHmac("sha256", "shopify-secret")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("public request authentication paths", () => {
  it("binds Checkout order context to the webhook confirmation number", () => {
    const identity = { mode: "checkout" as const, shopDomain: "harbor-test.myshopify.com" };
    const orderGid = "gid://shopify/Order/42";
    const fact = {
      shopDomain: "harbor-test.myshopify.com",
      confirmationNumberHash: orderConfirmationIdentityHash(
        "harbor-test.myshopify.com",
        "HARBOR42",
      ),
    };

    expect(() => assertPublicOrderContext(
      identity,
      { orderConfirmationNumber: "harbor42" },
      orderGid,
      fact,
    )).not.toThrow();
    expect(() => assertPublicOrderContext(
      identity,
      { orderConfirmationNumber: "another-order" },
      orderGid,
      fact,
    )).toThrow("confirmation number is invalid");
    expect(() => assertPublicOrderContext(identity, {}, orderGid, fact)).toThrow(
      "require the order confirmation number",
    );
  });

  it("rejects order facts supplied through a theme App Proxy", () => {
    expect(() => assertPublicOrderContext(
      { mode: "proxy", shopDomain: "harbor-test.myshopify.com" },
      {},
      "gid://shopify/Order/42",
      null,
    )).toThrow("Theme clients cannot supply order context");
  });

  it("fails closed without a production shop binding", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SHOPIFY_SHOP_DOMAIN;

    expect(() => canonicalShopDomain("other.myshopify.com")).toThrow(
      "SHOPIFY_SHOP_DOMAIN must be configured in production",
    );
    expect(() => assertConfiguredShopDomain("other.myshopify.com")).toThrow(
      "SHOPIFY_SHOP_DOMAIN must be configured in production",
    );
  });

  it("rejects an authenticated shop outside the production binding", () => {
    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_SHOP_DOMAIN = "harbor.myshopify.com";

    expect(() => canonicalShopDomain("other.myshopify.com")).toThrow();
    expect(() => assertConfiguredShopDomain("other.myshopify.com")).toThrow();
  });

  it("accepts a valid Checkout session JWT", () => {
    process.env.SHOPIFY_API_KEY = "shopify-key";
    process.env.SHOPIFY_API_SECRET = "shopify-secret";
    const identity = publicRequestIdentity(new Request("https://poll.example/api/public/sessions", {
      headers: { authorization: `Bearer ${checkoutToken()}` },
    }));
    expect(identity).toEqual({
      shopDomain: "harbor-test.myshopify.com",
      customerGid: "gid://shopify/Customer/1",
      mode: "checkout",
    });
  });

  it("accepts a timestamped Shopify app proxy signature", () => {
    process.env.SHOPIFY_API_SECRET = "shopify-secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `shop=harbor-test.myshopify.comtimestamp=${timestamp}`;
    const signature = createHmac("sha256", "shopify-secret").update(message).digest("hex");
    const identity = publicRequestIdentity(new Request(
      `https://poll.example/api/public/surveys/resolve?shop=harbor-test.myshopify.com&timestamp=${timestamp}&signature=${signature}`,
    ));
    expect(identity).toEqual({ shopDomain: "harbor-test.myshopify.com", mode: "proxy" });
  });

  it("keeps unsigned public links in standalone mode outside explicit demo mode", () => {
    delete process.env.DEMO_MODE;
    expect(publicRequestIdentity(new Request("https://poll.example/api/public/surveys/resolve"))).toEqual({ mode: "standalone" });
  });

  it("uses the fixed Harbor shop only in local demo mode", () => {
    process.env.DEMO_MODE = "true";
    expect(publicRequestIdentity(new Request("https://poll.example/api/public/surveys/resolve"))).toEqual({
      shopDomain: "shop.harborinno.com",
      mode: "demo",
    });
  });
});
