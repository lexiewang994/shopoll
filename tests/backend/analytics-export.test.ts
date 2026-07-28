import { describe, expect, it } from "vitest";

import { escapeCsvFormula } from "../../app/services/admin-analytics.server";

describe("analytics CSV export", () => {
  it("neutralizes spreadsheet formulas without changing ordinary answers", () => {
    expect(escapeCsvFormula("=HYPERLINK(\"https://example.com\")")).toBe(
      "'=HYPERLINK(\"https://example.com\")",
    );
    expect(escapeCsvFormula("  +SUM(1,1)")).toBe("'  +SUM(1,1)");
    expect(escapeCsvFormula("Paper7 eye comfort")).toBe("Paper7 eye comfort");
  });
});
