import { describe, expect, it } from "vitest";

import {
  isConfiguredRewardShopAlias,
  selectConfiguredOfflineSession,
} from "../../app/services/runtime/jobs.server";

describe("Shopify reward session binding", () => {
  it("selects only the configured offline myshopify session", () => {
    const configured = "harbor.myshopify.com";
    const sessions = [
      { shop: "other.myshopify.com", isOnline: false, id: "other-offline" },
      { shop: "shop.harborinno.com", isOnline: false, id: "custom-offline" },
      { shop: "harbor.myshopify.com", isOnline: true, id: "configured-online" },
      { shop: "Harbor.MyShopify.com", isOnline: false, id: "configured-offline" },
    ];

    expect(selectConfiguredOfflineSession(sessions, configured)).toEqual({
      shop: "Harbor.MyShopify.com",
      isOnline: false,
      id: "configured-offline",
    });
  });

  it("accepts only configured myshopify and custom-domain response aliases", () => {
    const aliases = ["harbor.myshopify.com", "shop.harborinno.com"];

    expect(isConfiguredRewardShopAlias("harbor.myshopify.com", aliases)).toBe(true);
    expect(isConfiguredRewardShopAlias("shop.harborinno.com", aliases)).toBe(true);
    expect(isConfiguredRewardShopAlias("other.myshopify.com", aliases)).toBe(false);
  });
});
