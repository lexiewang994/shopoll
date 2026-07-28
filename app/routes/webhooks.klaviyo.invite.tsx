import type { ActionFunctionArgs } from "react-router";
import { verifyKlaviyoFlowWebhook } from "../services/integrations";
import { createKlaviyoInvite } from "../services/runtime/webhooks.server";
import { publicJsonBody, publicSuccess } from "../services/runtime/http.server";
import { runtimeErrorResponse } from "../services/runtime/public-surveys.server";
import { RuntimeError } from "../services/runtime/common.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method !== "POST") throw new RuntimeError(405, "method_not_allowed", "POST is required");
    const secret = process.env.KLAVIYO_FLOW_SECRET;
    if (!secret) throw new RuntimeError(503, "klaviyo_not_configured", "Klaviyo Flow authentication is not configured");
    const configuredFlows = process.env.KLAVIYO_ALLOWED_FLOW_IDS
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!configuredFlows?.length) {
      throw new RuntimeError(503, "klaviyo_flow_allowlist_missing", "Klaviyo Flow allowlist is not configured");
    }
    const verification = verifyKlaviyoFlowWebhook(request.headers, {
      secret,
      allowedFlowIds: configuredFlows,
    });
    if (!verification.ok) throw new RuntimeError(401, verification.reason, "Klaviyo Flow authentication failed");
    return publicSuccess(await createKlaviyoInvite(await publicJsonBody(request), verification.flowId), 201);
  } catch (error) {
    return runtimeErrorResponse(error);
  }
};
