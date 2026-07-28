import { describe, expect, it } from "vitest";

import { HARBOR_SURVEY_TEMPLATES } from "../../app/data";
import type { SurveyDefinitionV1 } from "../../app/domain";
import { validateSurveyDefinition } from "../../app/domain";

const text = { en: "English", de: "Deutsch", es: "Español" } as const;

function definition(
  overrides: Partial<SurveyDefinitionV1> = {},
): SurveyDefinitionV1 {
  return {
    schemaVersion: 1,
    id: "test",
    version: 1,
    slug: "test",
    internalName: "Test",
    category: "standalone",
    defaultLocale: "en",
    enabledLocales: ["en", "de", "es"],
    title: text,
    questions: [
      {
        id: "q1",
        kind: "single_choice",
        title: text,
        options: [{ id: "yes", label: text }],
      },
      { id: "q2", kind: "short_text", title: text },
      { id: "end", kind: "end", title: text },
    ],
    ...overrides,
  };
}

describe("validateSurveyDefinition", () => {
  it("accepts every bundled Harbor template", () => {
    for (const template of HARBOR_SURVEY_TEMPLATES) {
      expect(validateSurveyDefinition(template), template.id).toEqual({
        valid: true,
        issues: [],
      });
    }
  });

  it("reports missing translations and duplicate ids", () => {
    const result = validateSurveyDefinition(
      definition({
        questions: [
          {
            id: "same",
            kind: "single_choice",
            title: { en: "Only English" },
            options: [
              { id: "duplicate", label: text },
              { id: "duplicate", label: text },
            ],
          },
          { id: "same", kind: "short_text", title: text },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_translation",
        "duplicate_question_id",
        "duplicate_option_id",
      ]),
    );
  });

  it("detects navigation cycles and unreachable questions", () => {
    const cycle = validateSurveyDefinition(
      definition({
        navigation: [
          {
            id: "loop",
            fromQuestionId: "q2",
            action: { type: "go_to", questionId: "q1" },
          },
        ],
      }),
    );
    expect(cycle.issues.some((item) => item.code === "cycle")).toBe(true);

    const unreachable = validateSurveyDefinition(
      definition({
        navigation: [
          { id: "stop", fromQuestionId: "q1", action: { type: "complete" } },
        ],
      }),
    );
    expect(
      unreachable.issues.filter((item) => item.code === "unreachable_question"),
    ).toHaveLength(2);
  });

  it("detects cyclic condition dependencies", () => {
    const result = validateSurveyDefinition(
      definition({
        questions: [
          {
            id: "q1",
            kind: "short_text",
            title: text,
            visibleWhen: {
              mode: "all",
              conditions: [{ questionId: "q2", operator: "is_answered" }],
            },
          },
          {
            id: "q2",
            kind: "short_text",
            title: text,
            visibleWhen: {
              mode: "all",
              conditions: [{ questionId: "q1", operator: "is_answered" }],
            },
          },
          { id: "end", kind: "end", title: text },
        ],
      }),
    );

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "cycle", path: "conditions" }),
    );
  });
});
