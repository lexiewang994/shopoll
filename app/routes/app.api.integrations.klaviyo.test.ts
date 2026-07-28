import type { ActionFunctionArgs } from "react-router";

import { KlaviyoEventsClient } from "../services/integrations";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Klaviyo is not configured" }, { status: 409 });
  }
  const body = (await request.json()) as { email?: string };
  if (!body.email) {
    return Response.json({ error: "A test profile email is required" }, { status: 422 });
  }
  const client = new KlaviyoEventsClient({ apiKey });
  await client.sendSurveyReady({
    profile: { email: body.email.trim() },
    uniqueId: `shopoll-test-${crypto.randomUUID()}`,
    surveyId: "shopoll-test",
    surveyVersionId: "shopoll-test-v1",
    channel: "klaviyo",
    inviteId: "test-invite",
    inviteUrl: `${process.env.SHOPOLL_PUBLIC_URL || process.env.SHOPIFY_APP_URL}/demo?view=survey`,
  });
  return Response.json({ sent: true });
};
