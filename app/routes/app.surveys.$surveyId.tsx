import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import {
  SurveyEditorPage,
  type EditorPlacement,
} from "../components/SurveyEditorPage";
import type { SurveyDefinitionV1 } from "../domain";
import { getAdminSurvey } from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const survey = await getAdminSurvey(shopDomain, String(params.surveyId));
  return {
    survey: {
      id: survey.id,
      status: survey.status,
      definition: survey.draftDefinition as unknown as SurveyDefinitionV1,
      activeVersion: survey.activeVersion?.version ?? null,
      versions: survey.versions.map((version) => ({
        id: version.id,
        version: version.version,
        publishedAt: version.publishedAt.toISOString(),
        checksum: version.checksum,
        releaseNote: version.releaseNote,
        active: version.id === survey.activeVersionId,
      })),
      placements: survey.placements.map((placement) => ({
        id: placement.id,
        surface: placement.surface,
        enabled: placement.enabled,
        priority: placement.priority,
        sampleRate: placement.sampleRate,
        frequencyCapDays: placement.frequencyCapDays,
        startsAt: placement.startsAt?.toISOString() ?? null,
        endsAt: placement.endsAt?.toISOString() ?? null,
        maxResponses: placement.maxResponses,
        triggerConfig: placement.triggerConfig,
        styleConfig: placement.styleConfig,
        audienceRules: placement.audienceRules.map((rule) => ({
          groupIndex: rule.groupIndex,
          groupJoin: rule.groupJoin,
          field: rule.field,
          operator: rule.operator,
          value: rule.value,
        })),
      })),
    },
  };
};

async function jsonRequest<T>(
  url: string,
  init: RequestInit,
  requestFailed: string,
  invalidResponse: string,
): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T & { error?: string })
    : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `${requestFailed} (${response.status})`);
  }
  if (!payload) throw new Error(invalidResponse);
  return payload;
}

export default function SurveyEditorRoute() {
  const { t } = useAdminI18n();
  const { survey } = useLoaderData<typeof loader>();
  const endpoint = `/app/api/surveys/${survey.id}`;
  return (
    <s-page>
      <SurveyEditorPage
        key={survey.id}
        embedded
        initialDefinition={survey.definition}
        initialStatus={survey.status}
        initialVersion={survey.activeVersion ?? 0}
        versions={survey.versions}
        placements={survey.placements as EditorPlacement[]}
        onSave={async (definition) => {
          await jsonRequest(
            endpoint,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ definition }),
            },
            t("请求失败"),
            t("服务器返回了无法识别的响应"),
          );
        }}
        onPublish={async (_definition, releaseNote) => {
          const payload = await jsonRequest<{
            version: {
              id: string;
              version: number;
              publishedAt: string;
              checksum: string;
              releaseNote?: string | null;
            };
          }>(
            endpoint,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ intent: "publish", releaseNote }),
            },
            t("请求失败"),
            t("服务器返回了无法识别的响应"),
          );
          return { ...payload.version, active: true };
        }}
        onSavePlacement={async (placement) => {
          await jsonRequest(
            `${endpoint}/placements`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(placement),
            },
            t("请求失败"),
            t("服务器返回了无法识别的响应"),
          );
        }}
        onCreateStandaloneLink={async () => {
          const payload = await jsonRequest<{ invite: { inviteUrl: string } }>(
            `${endpoint}/invites`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                idempotencyKey: crypto.randomUUID(),
                locale: survey.definition.defaultLocale,
                expiresInDays: 30,
              }),
            },
            t("请求失败"),
            t("服务器返回了无法识别的响应"),
          );
          return payload.invite.inviteUrl;
        }}
      />
    </s-page>
  );
}
