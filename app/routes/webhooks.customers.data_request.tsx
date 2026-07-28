import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processCustomerDataRequest } from "../services/runtime/webhooks.server";
import { canonicalShopDomain } from "../services/shop-domain.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? undefined;
  const { payload, shop } = await authenticate.webhook(request);
  await processCustomerDataRequest(canonicalShopDomain(shop), payload, webhookId);
  return new Response(null, { status: 200 });
};
