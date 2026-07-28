import { describe, expect, it } from "vitest";

import {
  evaluateAudience,
  localizeText,
  resolveSurveyLocale,
  selectHighestPrioritySurvey,
} from "../../app/domain";

describe("audience evaluation and locale resolution", () => {
  it("evaluates a one-level all/any group", () => {
    expect(
      evaluateAudience(
        {
          mode: "all",
          rules: [
            { id: "country", field: "country", operator: "in", value: ["DE", "ES"] },
            { id: "amount", field: "orderAmount", operator: "greater_than_or_equal", value: 100 },
          ],
        },
        { country: "DE", orderAmount: 149 },
      ),
    ).toBe(true);
  });

  it("selects the highest priority active eligible survey", () => {
    const selected = selectHighestPrioritySurvey(
      [
        { surveyId: "low", priority: 1, status: "active", value: "low" },
        { surveyId: "paused", priority: 100, status: "paused", value: "paused" },
        {
          surveyId: "high",
          priority: 10,
          status: "active",
          audience: {
            mode: "all",
            rules: [{ id: "device", field: "device", operator: "equals", value: "desktop" }],
          },
          value: "high",
        },
      ],
      { device: "desktop" },
      { now: new Date("2026-01-01T00:00:00.000Z") },
    );

    expect(selected?.value).toBe("high");
  });

  it("normalizes regional locales and falls back to English", () => {
    expect(resolveSurveyLocale("de-DE", ["en", "de", "es"])).toBe("de");
    expect(resolveSurveyLocale("fr-FR", ["en", "de", "es"])).toBe("en");
    expect(
      localizeText(
        { en: "Thank you", de: "Danke", es: "Gracias" },
        "es-MX",
      ),
    ).toBe("Gracias");
  });
});
