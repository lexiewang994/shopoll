import { describe, expect, it } from "vitest";

import { PURCHASE_MOTIVATION_TEMPLATE } from "../../app/data";
import {
  computeNextVisibleQuestions,
  getNextVisibleQuestion,
  upsertAnswer,
  validateAnswerUpsert,
} from "../../app/domain";

describe("survey runtime", () => {
  it("routes a purchase to only the selected product reason set", () => {
    const path = computeNextVisibleQuestions(
      PURCHASE_MOTIVATION_TEMPLATE,
      "core_product",
      { core_product: "bricbloc" },
    );

    expect(path.map((question) => question.id)).toEqual([
      "bricbloc_reason",
      "discovery_source",
      "purchase_barrier",
      "end",
    ]);
  });

  it("resolves the next visible question from the beginning", () => {
    expect(
      getNextVisibleQuestion(PURCHASE_MOTIVATION_TEMPLATE, null, {})?.id,
    ).toBe("welcome");
  });

  it("rejects invalid choice answers", () => {
    const result = validateAnswerUpsert(PURCHASE_MOTIVATION_TEMPLATE, {
      schemaVersion: 1,
      sessionId: "session-1",
      questionId: "core_product",
      value: "not-a-product",
      idempotencyKey: "request-1",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_option" }),
    );
  });

  it("upserts by question and makes repeated idempotency keys no-ops", () => {
    const firstInput = {
      schemaVersion: 1 as const,
      sessionId: "session-1",
      questionId: "core_product",
      value: "paper7",
      idempotencyKey: "request-1",
    };
    const first = upsertAnswer(
      PURCHASE_MOTIVATION_TEMPLATE,
      [],
      firstInput,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(upsertAnswer(PURCHASE_MOTIVATION_TEMPLATE, first, firstInput)).toBe(first);

    const changed = upsertAnswer(PURCHASE_MOTIVATION_TEMPLATE, first, {
      ...firstInput,
      value: "nexus",
      idempotencyKey: "request-2",
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      value: "nexus",
      questionSnapshot: { id: "core_product" },
    });
  });
});
