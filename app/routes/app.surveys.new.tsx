import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import { TemplatePickerPage } from "../components/TemplatePickerPage";
import type { SurveyDefinitionV1 } from "../domain";
import db from "../db.server";
import { ensureShop } from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  await ensureShop(shopDomain);
  const shop = await db.shop.findUniqueOrThrow({
    where: { domain: shopDomain },
    select: { defaultSurveyLocale: true },
  });
  const defaultLocale = ["en", "de", "es"].includes(shop.defaultSurveyLocale)
    ? shop.defaultSurveyLocale as "en" | "de" | "es"
    : "en";
  return { shopDomain, defaultLocale };
};

export default function NewSurveyRoute() {
  const { t } = useAdminI18n();
  const { defaultLocale } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const createSurvey = async (templateId: string) => {
    const response = await fetch("/app/api/surveys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateId,
        defaultLocale,
        ...(templateId === "blank" ? { name: "Untitled survey" } : {}),
      }),
    });
    const payload = (await response.json()) as {
      survey?: {
        id: string;
        draftDefinition: SurveyDefinitionV1;
      };
      error?: string;
    };
    if (!response.ok || !payload.survey) {
      throw new Error(
        payload.error ??
          t("无法创建问卷 ({status})", { status: response.status }),
      );
    }
    if (templateId === "blank") {
      const definition: SurveyDefinitionV1 = {
        ...payload.survey.draftDefinition,
        internalName: "Untitled survey",
        defaultLocale,
        enabledLocales: defaultLocale === "en" ? ["en"] : ["en", defaultLocale],
        title: { en: "Untitled survey" },
        description: undefined,
        questions: [],
        navigation: [],
      };
      const saveResponse = await fetch(
        `/app/api/surveys/${payload.survey.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ definition }),
        },
      );
      if (!saveResponse.ok) {
        const savePayload = (await saveResponse.json()) as { error?: string };
        throw new Error(savePayload.error ?? t("空白问卷初始化失败"));
      }
    }
    navigate(`/app/surveys/${payload.survey.id}`);
  };

  return (
    <s-page>
      <TemplatePickerPage
        backAction={
          <s-button href="/app/surveys" variant="tertiary">
            <s-icon type="arrow-left" />
            {t("返回问卷")}
          </s-button>
        }
        onSelect={createSurvey}
      />
    </s-page>
  );
}
