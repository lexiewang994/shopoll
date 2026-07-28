import { describe, expect, it } from "vitest";

import {
  productWeeklyBreakdown,
  topAnswers,
} from "../../app/services/runtime/jobs.server";

function answer(questionId: string, value: string, labels: Record<string, string>) {
  return {
    questionId,
    value,
    questionSnapshot: {
      id: questionId,
      kind: "single_choice",
      options: Object.entries(labels).map(([id, label]) => ({
        id,
        label: { en: label },
      })),
    },
  };
}

describe("weekly report breakdowns", () => {
  it("ranks localized labels deterministically when counts tie", () => {
    const labels = { privacy: "Local AI and privacy", storage: "NAS storage" };
    expect(
      topAnswers(
        [
          answer("nexus_reason", "storage", labels),
          answer("nexus_reason", "privacy", labels),
        ],
        ["nexus_reason"],
        "en",
      ),
    ).toEqual(["Local AI and privacy", "NAS storage"]);
  });

  it("keeps product-specific motivations, channels, and obstacles separate", () => {
    const responses = [
      {
        completedAt: new Date("2026-07-25T00:00:00.000Z"),
        answers: [
          answer("core_product", "paper7", { paper7: "Paper7" }),
          answer("paper7_reason", "eye", { eye: "Eye comfort" }),
          answer("discovery_source", "review", { review: "Review" }),
          answer("purchase_barrier", "price", { price: "Price" }),
        ],
      },
      {
        completedAt: null,
        answers: [
          answer("core_product", "nexus", { nexus: "Nexus" }),
          answer("nexus_reason", "privacy", { privacy: "Local AI and privacy" }),
        ],
      },
    ];

    expect(productWeeklyBreakdown(responses, "paper7", "en")).toEqual({
      responseCount: 1,
      topMotivations: ["Eye comfort"],
      topChannels: ["Review"],
      topObstacles: ["Price"],
    });
    expect(productWeeklyBreakdown(responses, "nexus", "en")).toMatchObject({
      responseCount: 1,
      topMotivations: ["Local AI and privacy"],
    });
  });
});
