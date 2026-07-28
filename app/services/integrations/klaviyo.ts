export const KLAVIYO_EVENT_NAMES = Object.freeze({
  surveyReady: "Survey Ready",
  surveyStarted: "Survey Started",
  surveyCompleted: "Survey Completed",
  rewardIssued: "Reward Issued",
  weeklyReport: "Shopoll Weekly Report",
});

export type KlaviyoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** This profile identifier is intentionally transient and must not be persisted. */
export interface KlaviyoTransientProfile {
  id?: string;
  email?: string;
  phoneNumber?: string;
  externalId?: string;
}

export type SurveyDeliveryChannel =
  | "checkout"
  | "klaviyo"
  | "standalone"
  | "theme";

interface KlaviyoEventBase {
  profile: KlaviyoTransientProfile;
  /** Stable across retries; Klaviyo uses this value for event deduplication. */
  uniqueId: string;
  occurredAt?: Date | string;
}

interface SurveyEventBase extends KlaviyoEventBase {
  surveyId: string;
  surveyVersionId: string;
  channel: SurveyDeliveryChannel;
  locale?: string;
  orderGid?: string;
}

export interface SurveyReadyEvent extends SurveyEventBase {
  inviteUrl: string;
  inviteId: string;
}

export interface SurveyStartedEvent extends SurveyEventBase {
  responseSessionId: string;
}

export interface SurveyCompletedEvent extends SurveyEventBase {
  responseSessionId: string;
  durationSeconds?: number;
  npsScore?: number;
  csatScore?: number;
  rewardEligible?: boolean;
}

export interface RewardIssuedEvent extends SurveyEventBase {
  responseSessionId: string;
  rewardIssueId: string;
  rewardType: "fixed_amount" | "free_shipping" | "percentage";
  code: string;
  expiresAt: Date | string;
}

export interface WeeklyReportEvent extends KlaviyoEventBase {
  reportSubscriptionId: string;
  shopDomain: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  dashboardUrl: string;
  responseCount: number;
  previousResponseCount?: number;
  responseCountChange?: number;
  responseCountChangePercent?: number;
  completionRate: number;
  previousCompletionRate?: number;
  completionRateChangePoints?: number;
  nps?: number;
  previousNps?: number;
  npsChange?: number;
  topMotivations?: readonly string[];
  previousTopMotivations?: readonly string[];
  topChannels?: readonly string[];
  previousTopChannels?: readonly string[];
  topObstacles?: readonly string[];
  previousTopObstacles?: readonly string[];
  paper7ResponseCount?: number;
  paper7TopMotivations?: readonly string[];
  paper7TopChannels?: readonly string[];
  paper7TopObstacles?: readonly string[];
  bricblocResponseCount?: number;
  bricblocTopMotivations?: readonly string[];
  bricblocTopChannels?: readonly string[];
  bricblocTopObstacles?: readonly string[];
  nexusResponseCount?: number;
  nexusTopMotivations?: readonly string[];
  nexusTopChannels?: readonly string[];
  nexusTopObstacles?: readonly string[];
  failedIntegrationEvents?: number;
  failedRewards?: number;
  anomalies?: readonly string[];
}

export interface KlaviyoAcceptedEvent {
  accepted: true;
  status: 202;
  requestId?: string;
}

export class KlaviyoApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(status: number, requestId?: string) {
    super(`Klaviyo Events API request failed with status ${status}`);
    this.name = "KlaviyoApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

export interface KlaviyoEventsClientOptions {
  apiKey: string;
  fetch?: KlaviyoFetch;
  revision?: string;
  endpoint?: string;
}

type EventProperty = boolean | number | string | readonly string[];
type EventProperties = Record<string, EventProperty>;

function compactProperties(
  properties: Record<string, EventProperty | undefined>,
): EventProperties {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, EventProperty] =>
      entry[1] !== undefined,
    ),
  );
}

function isoDate(value: Date | string, label: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date.toISOString();
}

function profileData(profile: KlaviyoTransientProfile): Record<string, unknown> {
  const identifiers = [
    profile.id,
    profile.email,
    profile.phoneNumber,
    profile.externalId,
  ].filter((value) => value !== undefined && value.length > 0);
  if (identifiers.length === 0) {
    throw new Error("A Klaviyo profile identifier is required");
  }

  if (profile.id) {
    return { type: "profile", id: profile.id };
  }

  return {
    type: "profile",
    attributes: {
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.phoneNumber ? { phone_number: profile.phoneNumber } : {}),
      ...(profile.externalId ? { external_id: profile.externalId } : {}),
    },
  };
}

function surveyProperties(input: SurveyEventBase): EventProperties {
  return compactProperties({
    survey_id: input.surveyId,
    survey_version_id: input.surveyVersionId,
    channel: input.channel,
    locale: input.locale,
    order_gid: input.orderGid,
  });
}

export class KlaviyoEventsClient {
  private readonly apiKey: string;
  private readonly fetch: KlaviyoFetch;
  private readonly revision: string;
  private readonly endpoint: string;

  constructor(options: KlaviyoEventsClientOptions) {
    if (options.apiKey.length === 0) {
      throw new Error("Klaviyo API key must not be empty");
    }
    this.apiKey = options.apiKey;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.revision = options.revision ?? "2026-01-15";
    this.endpoint = options.endpoint ?? "https://a.klaviyo.com/api/events";
  }

  sendSurveyReady(input: SurveyReadyEvent): Promise<KlaviyoAcceptedEvent> {
    return this.send(
      KLAVIYO_EVENT_NAMES.surveyReady,
      input,
      compactProperties({
        ...surveyProperties(input),
        invite_id: input.inviteId,
        invite_url: input.inviteUrl,
      }),
    );
  }

  sendSurveyStarted(input: SurveyStartedEvent): Promise<KlaviyoAcceptedEvent> {
    return this.send(
      KLAVIYO_EVENT_NAMES.surveyStarted,
      input,
      compactProperties({
        ...surveyProperties(input),
        response_session_id: input.responseSessionId,
      }),
    );
  }

  sendSurveyCompleted(input: SurveyCompletedEvent): Promise<KlaviyoAcceptedEvent> {
    return this.send(
      KLAVIYO_EVENT_NAMES.surveyCompleted,
      input,
      compactProperties({
        ...surveyProperties(input),
        response_session_id: input.responseSessionId,
        duration_seconds: input.durationSeconds,
        nps_score: input.npsScore,
        csat_score: input.csatScore,
        reward_eligible: input.rewardEligible,
      }),
    );
  }

  sendRewardIssued(input: RewardIssuedEvent): Promise<KlaviyoAcceptedEvent> {
    return this.send(
      KLAVIYO_EVENT_NAMES.rewardIssued,
      input,
      compactProperties({
        ...surveyProperties(input),
        response_session_id: input.responseSessionId,
        reward_issue_id: input.rewardIssueId,
        reward_type: input.rewardType,
        reward_code: input.code,
        reward_expires_at: isoDate(input.expiresAt, "expiresAt"),
      }),
    );
  }

  sendWeeklyReport(input: WeeklyReportEvent): Promise<KlaviyoAcceptedEvent> {
    return this.send(
      KLAVIYO_EVENT_NAMES.weeklyReport,
      input,
      compactProperties({
        report_subscription_id: input.reportSubscriptionId,
        shop_domain: input.shopDomain,
        period_start: isoDate(input.periodStart, "periodStart"),
        period_end: isoDate(input.periodEnd, "periodEnd"),
        dashboard_url: input.dashboardUrl,
        response_count: input.responseCount,
        previous_response_count: input.previousResponseCount,
        response_count_change: input.responseCountChange,
        response_count_change_percent: input.responseCountChangePercent,
        completion_rate: input.completionRate,
        previous_completion_rate: input.previousCompletionRate,
        completion_rate_change_points: input.completionRateChangePoints,
        nps: input.nps,
        previous_nps: input.previousNps,
        nps_change: input.npsChange,
        top_motivations: input.topMotivations,
        previous_top_motivations: input.previousTopMotivations,
        top_channels: input.topChannels,
        previous_top_channels: input.previousTopChannels,
        top_obstacles: input.topObstacles,
        previous_top_obstacles: input.previousTopObstacles,
        paper7_response_count: input.paper7ResponseCount,
        paper7_top_motivations: input.paper7TopMotivations,
        paper7_top_channels: input.paper7TopChannels,
        paper7_top_obstacles: input.paper7TopObstacles,
        bricbloc_response_count: input.bricblocResponseCount,
        bricbloc_top_motivations: input.bricblocTopMotivations,
        bricbloc_top_channels: input.bricblocTopChannels,
        bricbloc_top_obstacles: input.bricblocTopObstacles,
        nexus_response_count: input.nexusResponseCount,
        nexus_top_motivations: input.nexusTopMotivations,
        nexus_top_channels: input.nexusTopChannels,
        nexus_top_obstacles: input.nexusTopObstacles,
        failed_integration_events: input.failedIntegrationEvents,
        failed_rewards: input.failedRewards,
        anomalies: input.anomalies,
      }),
    );
  }

  private async send(
    metricName: string,
    input: KlaviyoEventBase,
    properties: EventProperties,
  ): Promise<KlaviyoAcceptedEvent> {
    if (input.uniqueId.length === 0 || input.uniqueId.length > 255) {
      throw new Error("Klaviyo uniqueId must contain between 1 and 255 characters");
    }

    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/vnd.api+json",
        authorization: `Klaviyo-API-Key ${this.apiKey}`,
        "content-type": "application/vnd.api+json",
        revision: this.revision,
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            properties,
            unique_id: input.uniqueId,
            ...(input.occurredAt
              ? { time: isoDate(input.occurredAt, "occurredAt") }
              : {}),
            metric: {
              data: {
                type: "metric",
                attributes: { name: metricName },
              },
            },
            profile: { data: profileData(input.profile) },
          },
        },
      }),
    });

    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (response.status !== 202) {
      throw new KlaviyoApiError(response.status, requestId);
    }

    return { accepted: true, status: 202, ...(requestId ? { requestId } : {}) };
  }
}
