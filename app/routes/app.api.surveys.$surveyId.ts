import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import type { SurveyDefinitionV1 } from "../domain";
import {
  duplicateSurvey,
  getAdminSurvey,
  publishSurvey,
  saveSurveyDraft,
  setSurveyState,
} from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  return Response.json({
    survey: await getAdminSurvey(shopDomain, String(params.surveyId)),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const surveyId = String(params.surveyId);
  const body = (await request.json()) as {
    intent?: string;
    definition?: SurveyDefinitionV1;
    status?: "PUBLISHED" | "PAUSED" | "ARCHIVED";
    releaseNote?: string;
  };
  if (request.method === "PUT" || body.intent === "save") {
    if (!body.definition) {
      return Response.json({ error: "definition is required" }, { status: 422 });
    }
    return Response.json({
      survey: await saveSurveyDraft({
        shopDomain,
        surveyId,
        draft: body.definition,
        actorId: session.id,
      }),
    });
  }
  if (body.intent === "publish") {
    return Response.json({
      version: await publishSurvey({
        shopDomain,
        surveyId,
        actorId: session.id,
        releaseNote: body.releaseNote,
      }),
    });
  }
  if (body.intent === "duplicate") {
    return Response.json(
      { survey: await duplicateSurvey({ shopDomain, surveyId, actorId: session.id }) },
      { status: 201 },
    );
  }
  if (body.intent === "status" && body.status) {
    return Response.json({
      survey: await setSurveyState({
        shopDomain,
        surveyId,
        status: body.status,
        actorId: session.id,
      }),
    });
  }
  return Response.json({ error: "Unsupported intent" }, { status: 400 });
};
