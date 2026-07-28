import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { HARBOR_SURVEY_TEMPLATES } from "../data";
import {
  createSurveyFromTemplate,
  listAdminSurveys,
} from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  return Response.json({
    surveys: await listAdminSurveys(shopDomain),
    templates: HARBOR_SURVEY_TEMPLATES.map((template) => ({
      id: template.id,
      slug: template.slug,
      name: template.internalName,
      category: template.category,
    })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const body = (await request.json()) as {
    templateId?: string;
    name?: string;
    defaultLocale?: string;
  };
  if (!body.templateId) {
    return Response.json({ error: "templateId is required" }, { status: 422 });
  }
  const survey = await createSurveyFromTemplate({
    shopDomain,
    templateId: body.templateId,
    name: body.name,
    defaultLocale: ["en", "de", "es"].includes(String(body.defaultLocale))
      ? body.defaultLocale as "en" | "de" | "es"
      : undefined,
    actorId: session.id,
  });
  return Response.json({ survey }, { status: 201 });
};
