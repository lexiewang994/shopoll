import { Surface } from "@prisma/client";
import type { ActionFunctionArgs } from "react-router";

import {
  replaceAudienceRules,
  updatePlacement,
  type AudienceRuleInput,
} from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const body = (await request.json()) as {
    placementId?: string;
    surface?: string;
    enabled?: boolean;
    priority?: number;
    sampleRate?: number;
    frequencyCapDays?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    maxResponses?: number | null;
    triggerConfig?: unknown;
    styleConfig?: unknown;
    audienceRules?: AudienceRuleInput[];
  };
  if (!body.surface || !Object.values(Surface).includes(body.surface as Surface)) {
    return Response.json({ error: "A valid surface is required" }, { status: 422 });
  }
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    return Response.json({ error: "Placement dates must be valid ISO dates" }, { status: 422 });
  }
  const placement = await updatePlacement({
    shopDomain,
    surveyId: String(params.surveyId),
    surface: body.surface as Surface,
    enabled: body.enabled === true,
    priority: Math.trunc(body.priority ?? 0),
    sampleRate: body.sampleRate ?? 1,
    frequencyCapDays: Math.max(0, Math.trunc(body.frequencyCapDays ?? 14)),
    startsAt,
    endsAt,
    maxResponses: body.maxResponses === null || body.maxResponses === undefined
      ? null
      : Math.trunc(body.maxResponses),
    triggerConfig: body.triggerConfig ?? { type: "immediate" },
    styleConfig: body.styleConfig ?? { inheritShopBrand: true },
    actorId: session.id,
  });
  if (body.audienceRules) {
    await replaceAudienceRules({
      shopDomain,
      placementId: placement.id,
      rules: body.audienceRules,
      actorId: session.id,
    });
  }
  return Response.json({ placement });
};
