import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ingestFulfillmentWebhook } from "../services/runtime/webhooks.server";
import { payloadDigest } from "../services/runtime/common.server";
import { canonicalShopDomain } from "../services/shop-domain.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const { payload, topic, shop } = await authenticate.webhook(request);
  await ingestFulfillmentWebhook({
    shopDomain: canonicalShopDomain(shop),
    topic,
    webhookId: webhookId || `${topic}:${payloadDigest(payload)}`,
    payload,
  });
  return new Response(null, { status: 200 });
};
