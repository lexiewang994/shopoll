export const INTEGRATION_JOB_NAMES = Object.freeze({
  deliverKlaviyoEvent: "shopoll_deliver_klaviyo_event",
  issueShopifyReward: "shopoll_issue_shopify_reward",
  sendWeeklyReport: "shopoll_send_weekly_report",
  purgeRetainedData: "shopoll_purge_retained_data",
});

interface JobPayloadBase {
  version: 1;
  requestedAt: string;
}

export interface DeliverKlaviyoEventJobPayload extends JobPayloadBase {
  kind: "deliver-klaviyo-event";
  integrationEventId: string;
}

export interface IssueShopifyRewardJobPayload extends JobPayloadBase {
  kind: "issue-shopify-reward";
  rewardIssueId: string;
}

export interface SendWeeklyReportJobPayload extends JobPayloadBase {
  kind: "send-weekly-report";
  reportSubscriptionId: string;
  periodStart: string;
  periodEnd: string;
}

export interface PurgeRetainedDataJobPayload extends JobPayloadBase {
  kind: "purge-retained-data";
  shopId: string;
}

/**
 * Queue payloads intentionally contain only opaque database references. Email,
 * phone, names, addresses, tokens, API credentials and survey answers belong in
 * neither Graphile Worker nor any other queue implementation.
 */
export type IntegrationJobPayloadV1 =
  | DeliverKlaviyoEventJobPayload
  | IssueShopifyRewardJobPayload
  | SendWeeklyReportJobPayload
  | PurgeRetainedDataJobPayload;

const ALLOWED_KEYS: Record<IntegrationJobPayloadV1["kind"], readonly string[]> = {
  "deliver-klaviyo-event": [
    "version",
    "kind",
    "requestedAt",
    "integrationEventId",
  ],
  "issue-shopify-reward": [
    "version",
    "kind",
    "requestedAt",
    "rewardIssueId",
  ],
  "send-weekly-report": [
    "version",
    "kind",
    "requestedAt",
    "reportSubscriptionId",
    "periodStart",
    "periodEnd",
  ],
  "purge-retained-data": ["version", "kind", "requestedAt", "shopId"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function parseIntegrationJobPayload(
  value: unknown,
): IntegrationJobPayloadV1 {
  if (!isRecord(value) || value.version !== 1 || !isNonEmptyString(value.kind)) {
    throw new Error("Invalid integration job payload envelope");
  }
  if (!(value.kind in ALLOWED_KEYS)) {
    throw new Error(`Unsupported integration job kind: ${value.kind}`);
  }

  const kind = value.kind as IntegrationJobPayloadV1["kind"];
  const allowedKeys = ALLOWED_KEYS[kind];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new Error("Integration job payload contains unsupported fields");
  }
  if (!isIsoDate(value.requestedAt)) {
    throw new Error("Integration job requestedAt must be an ISO date");
  }

  switch (kind) {
    case "deliver-klaviyo-event":
      if (!isNonEmptyString(value.integrationEventId)) {
        throw new Error("integrationEventId is required");
      }
      break;
    case "issue-shopify-reward":
      if (!isNonEmptyString(value.rewardIssueId)) {
        throw new Error("rewardIssueId is required");
      }
      break;
    case "send-weekly-report":
      if (
        !isNonEmptyString(value.reportSubscriptionId) ||
        !isIsoDate(value.periodStart) ||
        !isIsoDate(value.periodEnd)
      ) {
        throw new Error("Weekly report payload is incomplete");
      }
      if (Date.parse(value.periodEnd) <= Date.parse(value.periodStart)) {
        throw new Error("Weekly report periodEnd must be later than periodStart");
      }
      break;
    case "purge-retained-data":
      if (!isNonEmptyString(value.shopId)) {
        throw new Error("shopId is required");
      }
      break;
  }

  return value as unknown as IntegrationJobPayloadV1;
}
