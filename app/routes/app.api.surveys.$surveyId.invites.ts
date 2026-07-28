import type { ActionFunctionArgs } from "react-router";

import { createStandaloneInvite } from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json()) as {
    idempotencyKey?: string;
    locale?: string;
    expiresInDays?: number;
  };
  const invite = await createStandaloneInvite({
    shopDomain: canonicalShopDomain(session.shop),
    surveyId: String(params.surveyId),
    idempotencyKey: String(body.idempotencyKey ?? ""),
    locale: body.locale,
    expiresInDays: body.expiresInDays,
    actorId: session.id,
  });
  return Response.json({
    invite: {
      ...invite,
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
};
