import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processShopRedact } from "../services/runtime/webhooks.server";
import { canonicalShopDomain } from "../services/shop-domain.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? undefined;
  const { shop } = await authenticate.webhook(request);
  await processShopRedact(canonicalShopDomain(shop), webhookId);
  return new Response(null, { status: 200 });
};
