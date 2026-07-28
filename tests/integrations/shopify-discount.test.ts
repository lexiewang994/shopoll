import { describe, expect, it, vi } from "vitest";

import {
  buildShopifyDiscountGraphqlRequest,
  ShopifyDiscountClient,
  ShopifyDiscountError,
} from "../../app/services/integrations/shopify-discount";

describe("Shopify discount mapping", () => {
  const now = new Date("2026-07-26T00:00:00.000Z");

  it("maps a percentage reward with conservative 14-day defaults", () => {
    const result = buildShopifyDiscountGraphqlRequest(
      {
        code: "THANKYOU10",
        reward: { type: "percentage", percentage: 10 },
        minimumSubtotal: "50.00",
        appliesToProductIds: ["gid://shopify/Product/1"],
      },
      now,
    );

    expect(result.mutation).toBe("discountCodeBasicCreate");
    expect(result.variables.basicCodeDiscount).toMatchObject({
      code: "THANKYOU10",
      startsAt: "2026-07-26T00:00:00.000Z",
      endsAt: "2026-08-09T00:00:00.000Z",
      context: { all: true },
      usageLimit: 1,
      appliesOncePerCustomer: true,
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      },
      minimumRequirement: {
        subtotal: { greaterThanOrEqualToSubtotal: "50.00" },
      },
      customerGets: {
        value: { percentage: 0.1 },
        items: {
          products: { productsToAdd: ["gid://shopify/Product/1"] },
        },
      },
    });
  });

  it("uses the dedicated free-shipping mutation", () => {
    const result = buildShopifyDiscountGraphqlRequest(
      {
        code: "FREESHIP",
        reward: { type: "free_shipping", maximumShippingPrice: "25.00" },
      },
      now,
    );

    expect(result.mutation).toBe("discountCodeFreeShippingCreate");
    expect(result.variables.freeShippingCodeDiscount).toMatchObject({
      destination: { all: true },
      maximumShippingPrice: "25.00",
    });
  });
});

describe("ShopifyDiscountClient", () => {
  it("maps a successful Admin GraphQL response", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
          data: {
            discountCodeBasicCreate: {
              codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" },
              userErrors: [],
            },
          },
        });
      },
    );
    const client = new ShopifyDiscountClient({
      shopDomain: "harbor.myshopify.com",
      accessToken: "offline-token",
      fetch: fetchMock,
      now: () => new Date("2026-07-26T00:00:00.000Z"),
    });

    await expect(
      client.createReward({
        code: "SAVE20",
        reward: { type: "fixed_amount", amount: "20.00" },
      }),
    ).resolves.toEqual({
      discountNodeId: "gid://shopify/DiscountCodeNode/1",
      code: "SAVE20",
      rewardType: "fixed_amount",
      startsAt: "2026-07-26T00:00:00.000Z",
      endsAt: "2026-08-09T00:00:00.000Z",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://harbor.myshopify.com/admin/api/2026-07/graphql.json",
    );
  });

  it("surfaces Shopify user errors without treating them as success", async () => {
    const client = new ShopifyDiscountClient({
      shopDomain: "harbor.myshopify.com",
      accessToken: "offline-token",
      fetch: async () =>
        Response.json({
          data: {
            discountCodeBasicCreate: {
              codeDiscountNode: null,
              userErrors: [
                { field: ["code"], message: "Code is already in use" },
              ],
            },
          },
        }),
    });

    await expect(
      client.createReward({
        code: "DUPLICATE",
        reward: { type: "percentage", percentage: 5 },
      }),
    ).rejects.toBeInstanceOf(ShopifyDiscountError);
  });
});
