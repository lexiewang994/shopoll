import { describe, expect, it } from "vitest";

import {
  BRICBLOC_REASON_OPTIONS,
  NEXUS_REASON_OPTIONS,
  PAPER7_REASON_OPTIONS,
  POST_DELIVERY_NPS_TEMPLATE,
} from "../../app/data";
import {
  buildAnalyticsSummary,
  calculateNps,
  compareWeeklyMetrics,
  rankChoiceAnswers,
  toWeeklyMetricSnapshot,
} from "../../app/domain";

describe("analytics helpers", () => {
  it("uses the standard promoter minus detractor NPS calculation", () => {
    expect(calculateNps([10, 9, 8, 6])).toBe(25);
    expect(calculateNps([])).toBeNull();
  });

  it("builds deterministic funnel, timing, and revenue metrics", () => {
    const summary = buildAnalyticsSummary(
      POST_DELIVERY_NPS_TEMPLATE,
      [
        {
          id: "one",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:20.000Z",
          answers: [{ questionId: "nps", value: 10 }],
          orderRevenue: 100,
        },
        {
          id: "two",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:40.000Z",
          answers: [{ questionId: "nps", value: 6 }],
          orderRevenue: 50,
        },
        {
          id: "three",
          startedAt: "2026-01-01T00:00:00.000Z",
          answers: [{ questionId: "nps", value: 8 }],
        },
      ],
      10,
    );

    expect(summary).toMatchObject({
      impressions: 10,
      starts: 3,
      partials: 1,
      completions: 2,
      startRate: 0.3,
      completionRate: 0.6667,
      averageCompletionSeconds: 30,
      nps: 0,
      attributedOrders: 2,
      attributedRevenue: 150,
      attributedAov: 75,
    });
  });

  it("sorts tied choice counts by option id", () => {
    const ranked = rankChoiceAnswers(
      [
        { id: "1", startedAt: "2026-01-01", answers: [{ questionId: "reason", value: "b" }] },
        { id: "2", startedAt: "2026-01-01", answers: [{ questionId: "reason", value: "a" }] },
      ],
      "reason",
    );
    expect(ranked.map((item) => item.optionId)).toEqual(["a", "b"]);
  });

  it("reports null percentage change when the previous baseline is zero", () => {
    const current = toWeeklyMetricSnapshot({
      impressions: 10,
      starts: 5,
      partials: 1,
      completions: 4,
      startRate: 0.5,
      completionRate: 0.8,
      averageCompletionSeconds: 20,
      nps: 50,
      csat: null,
      attributedOrders: 1,
      attributedRevenue: 100,
      attributedAov: 100,
    });
    const comparison = compareWeeklyMetrics(current, {
      impressions: 0,
      starts: 0,
      completions: 0,
      completionRate: 0,
      nps: null,
      csat: null,
      attributedOrders: 0,
      attributedRevenue: 0,
    });
    expect(comparison.impressions.percentChange).toBeNull();
    expect(comparison.nps.absoluteChange).toBeNull();
  });
});

describe("Harbor reason seeds", () => {
  it("contains the complete product-specific reason sets", () => {
    expect(PAPER7_REASON_OPTIONS).toHaveLength(9);
    expect(BRICBLOC_REASON_OPTIONS).toHaveLength(9);
    expect(NEXUS_REASON_OPTIONS).toHaveLength(9);
    expect(NEXUS_REASON_OPTIONS.map((option) => option.id)).toContain("local_ai_privacy");
    expect(BRICBLOC_REASON_OPTIONS.map((option) => option.id)).toContain("three_in_one");
    expect(PAPER7_REASON_OPTIONS.map((option) => option.id)).toContain("color_rlcd");
  });
});
