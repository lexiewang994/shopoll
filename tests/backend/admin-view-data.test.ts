import { describe, expect, it } from "vitest";

import {
  adminAnalyticsFilter,
  analyticsChoiceRows,
  analyticsFunnelCounts,
  analyticsSessionProduct,
} from "../../app/services/admin-view-data.server";

describe("admin analytics view helpers", () => {
  it("counts starts from startedAt and ignores automatically inferred answers", () => {
    const result = analyticsFunnelCounts(
      [
        {
          startedAt: null,
          completedAt: null,
          status: "VIEWED",
          answers: [{ idempotencyKey: "auto:session:core-product" }],
        },
        {
          startedAt: new Date("2026-07-01T00:00:00.000Z"),
          completedAt: null,
          status: "PARTIAL",
          answers: [{ idempotencyKey: "answer:first" }],
        },
        {
          startedAt: new Date("2026-07-02T00:00:00.000Z"),
          completedAt: new Date("2026-07-02T00:01:00.000Z"),
          status: "COMPLETED",
          answers: [
            { idempotencyKey: "answer:second" },
            { idempotencyKey: "answer:third" },
          ],
        },
      ],
      10,
    );

    expect(result).toMatchObject({ starts: 2, partials: 1, completions: 1 });
    expect(result.funnel.map((step) => step.value)).toEqual([10, 2, 2, 1, 1]);
  });

  it("groups translated choice answers by option id with an English label", () => {
    const snapshot = {
      options: [
        {
          id: "eye_comfort",
          label: { en: "Eye comfort", de: "Augenkomfort" },
        },
      ],
    };
    const rows = analyticsChoiceRows(
      [
        {
          questionId: "paper7_reason",
          value: "eye_comfort",
          questionSnapshot: snapshot,
          responseSession: { locale: "en" },
        },
        {
          questionId: "paper7_reason",
          value: "eye_comfort",
          questionSnapshot: snapshot,
          responseSession: { locale: "de" },
        },
      ],
      () => true,
    );

    expect(rows).toEqual([{ label: "Eye comfort", count: 2, value: 100 }]);
  });

  it("does not assign a multi-core order unless the customer selected one", () => {
    const facts = [{ productKey: "paper7" }, { productKey: "nexus" }];

    expect(analyticsSessionProduct(facts, [])).toBe("—");
    expect(
      analyticsSessionProduct(facts, [
        { questionId: "core_product", value: "nexus" },
      ]),
    ).toBe("Nexus");
    expect(
      analyticsSessionProduct(
        [{ productKey: "bricbloc" }, { productKey: "bricbloc" }],
        [],
      ),
    ).toBe("Bricbloc");
  });

  it("preserves variant and all UTM dimensions in filter queries", () => {
    const request = new Request(
      "https://shopoll.test/app/analytics?variantGid=gid%3A%2F%2Fshopify%2FProductVariant%2F7&utmSource=google&utmMedium=cpc&utmCampaign=launch",
    );
    const { filter, query } = adminAnalyticsFilter(request);

    expect(filter).toMatchObject({
      variantGid: "gid://shopify/ProductVariant/7",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "launch",
    });
    expect(query).toContain("variantGid=");
    expect(query).toContain("utmSource=google");
    expect(query).toContain("utmMedium=cpc");
  });
});
