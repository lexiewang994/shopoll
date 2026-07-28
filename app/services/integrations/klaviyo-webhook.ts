import { createHash, timingSafeEqual } from "node:crypto";

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

export type KlaviyoFlowWebhookVerification =
  | { ok: true; flowId?: string }
  | {
      ok: false;
      reason:
        | "missing_authorization"
        | "invalid_authorization"
        | "missing_flow_id"
        | "flow_not_allowed";
    };

export interface KlaviyoFlowWebhookOptions {
  secret: string;
  allowedFlowIds?: readonly string[];
  flowIdHeader?: string;
}

function readHeader(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target || value === undefined) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

/**
 * Verifies the custom headers configured on a Klaviyo Flow webhook action.
 * Klaviyo does not sign these webhook bodies, so Shopoll requires a private
 * Bearer value and can additionally pin requests to configured Flow IDs.
 */
export function verifyKlaviyoFlowWebhook(
  headers: HeaderSource,
  options: KlaviyoFlowWebhookOptions,
): KlaviyoFlowWebhookVerification {
  if (options.secret.length === 0) {
    throw new Error("Klaviyo Flow webhook secret must not be empty");
  }

  const authorization = readHeader(headers, "authorization");
  if (!authorization) {
    return { ok: false, reason: "missing_authorization" };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !constantTimeEqual(match[1], options.secret)) {
    return { ok: false, reason: "invalid_authorization" };
  }

  const flowId = readHeader(
    headers,
    options.flowIdHeader ?? "x-shopoll-flow-id",
  )?.trim();
  if (options.allowedFlowIds !== undefined) {
    if (!flowId) {
      return { ok: false, reason: "missing_flow_id" };
    }
    if (!options.allowedFlowIds.includes(flowId)) {
      return { ok: false, reason: "flow_not_allowed" };
    }
  }

  return flowId ? { ok: true, flowId } : { ok: true };
}
