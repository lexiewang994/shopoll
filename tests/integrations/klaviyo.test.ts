import { describe, expect, it, vi } from "vitest";

import {
  KlaviyoApiError,
  KlaviyoEventsClient,
} from "../../app/services/integrations/klaviyo";

describe("KlaviyoEventsClient", () => {
  it("maps a Survey Ready event and sends a retry-stable unique ID", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, {
          status: 202,
          headers: { "x-request-id": "request_1" },
        });
      },
    );
    const client = new KlaviyoEventsClient({
      apiKey: "private-key",
      fetch: fetchMock,
    });

    await expect(
      client.sendSurveyReady({
        profile: { email: "customer@harborinno.com" },
        uniqueId: "integration-event-1",
        occurredAt: "2026-07-26T10:00:00Z",
        surveyId: "survey_1",
        surveyVersionId: "version_1",
        inviteId: "invite_1",
        inviteUrl: "https://poll.harborinno.com/i/opaque-token",
        channel: "klaviyo",
        locale: "de",
      }),
    ).resolves.toEqual({ accepted: true, status: 202, requestId: "request_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://a.klaviyo.com/api/events");
    expect(init?.headers).toMatchObject({
      authorization: "Klaviyo-API-Key private-key",
      revision: "2026-01-15",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.data.attributes).toMatchObject({
      unique_id: "integration-event-1",
      time: "2026-07-26T10:00:00.000Z",
      metric: {
        data: { type: "metric", attributes: { name: "Survey Ready" } },
      },
      profile: {
        data: {
          type: "profile",
          attributes: { email: "customer@harborinno.com" },
        },
      },
      properties: {
        survey_id: "survey_1",
        invite_id: "invite_1",
        locale: "de",
      },
    });
  });

  it("does not include an API response body in thrown errors", async () => {
    const client = new KlaviyoEventsClient({
      apiKey: "private-key",
      fetch: async () =>
        new Response('{"errors":[{"detail":"customer@harborinno.com"}]}', {
          status: 400,
        }),
    });

    const promise = client.sendSurveyStarted({
      profile: { id: "profile_1" },
      uniqueId: "integration-event-2",
      surveyId: "survey_1",
      surveyVersionId: "version_1",
      responseSessionId: "response_1",
      channel: "standalone",
    });

    await expect(promise).rejects.toBeInstanceOf(KlaviyoApiError);
    await expect(promise).rejects.not.toThrow("customer@harborinno.com");
  });

  it("sends flat deterministic weekly comparisons and per-product rankings", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, { status: 202 });
      },
    );
    const client = new KlaviyoEventsClient({ apiKey: "private-key", fetch: fetchMock });

    await client.sendWeeklyReport({
      profile: { id: "internal-profile" },
      uniqueId: "weekly:report:2026-07-20",
      reportSubscriptionId: "report_1",
      shopDomain: "shop.harborinno.com",
      periodStart: "2026-07-20T00:00:00.000Z",
      periodEnd: "2026-07-27T00:00:00.000Z",
      dashboardUrl: "https://poll.harborinno.com/app/analytics",
      responseCount: 25,
      previousResponseCount: 20,
      responseCountChange: 5,
      responseCountChangePercent: 25,
      completionRate: 0.8,
      previousCompletionRate: 0.7,
      completionRateChangePoints: 10,
      nps: 42,
      previousNps: 35,
      npsChange: 7,
      paper7ResponseCount: 10,
      paper7TopMotivations: ["Eye comfort", "Outdoor readability"],
      failedIntegrationEvents: 1,
      failedRewards: 0,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.data.attributes.properties).toMatchObject({
      response_count: 25,
      previous_response_count: 20,
      response_count_change_percent: 25,
      completion_rate_change_points: 10,
      nps_change: 7,
      paper7_response_count: 10,
      paper7_top_motivations: ["Eye comfort", "Outdoor readability"],
      failed_integration_events: 1,
      failed_rewards: 0,
    });
  });
});
