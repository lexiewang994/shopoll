import { describe, expect, it } from "vitest";

import {
  buildRetentionCutoffs,
  effectiveDeletionAt,
  retentionExpiresAt,
} from "../../app/services/integrations/retention";
import { parseIntegrationJobPayload } from "../../app/services/integrations/job-payload";

describe("data retention", () => {
  it("uses 24 months, 90 days, and a 30-day uninstall grace period", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const cutoffs = buildRetentionCutoffs(now);

    expect(cutoffs.standardCreatedAt.toISOString()).toBe(
      "2024-07-26T12:00:00.000Z",
    );
    expect(cutoffs.contactCreatedAt.toISOString()).toBe(
      "2026-04-27T12:00:00.000Z",
    );
    expect(cutoffs.uninstalledAt.toISOString()).toBe(
      "2026-06-26T12:00:00.000Z",
    );
  });

  it("uses the earlier of normal retention and uninstall deletion", () => {
    const createdAt = new Date("2026-07-01T00:00:00.000Z");
    expect(retentionExpiresAt(createdAt, "contact").toISOString()).toBe(
      "2026-09-29T00:00:00.000Z",
    );
    expect(
      effectiveDeletionAt({
        createdAt,
        category: "contact",
        uninstalledAt: new Date("2026-07-10T00:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-08-09T00:00:00.000Z");
  });
});

describe("integration job payloads", () => {
  it("accepts opaque-reference-only payloads", () => {
    expect(
      parseIntegrationJobPayload({
        version: 1,
        kind: "deliver-klaviyo-event",
        requestedAt: "2026-07-26T00:00:00.000Z",
        integrationEventId: "event_123",
      }),
    ).toMatchObject({ integrationEventId: "event_123" });
  });

  it("rejects extra fields so PII cannot leak into a queue", () => {
    expect(() =>
      parseIntegrationJobPayload({
        version: 1,
        kind: "deliver-klaviyo-event",
        requestedAt: "2026-07-26T00:00:00.000Z",
        integrationEventId: "event_123",
        email: "customer@harborinno.com",
      }),
    ).toThrow("unsupported fields");
  });
});
