import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import { SurveyListPage } from "../components/SurveyListPage";
import type { SurveyRow } from "../components/shopoll-data";
import { analyticsSnapshot } from "../services/admin-analytics.server";
import { listAdminSurveys } from "../services/admin-surveys.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

type SurveyRecord = Awaited<ReturnType<typeof listAdminSurveys>>[number];

const categoryLabels: Record<string, string> = {
  PURCHASE_MOTIVATION: "购买动机",
  ATTRIBUTION: "认知渠道",
  PURCHASE_BARRIER: "购买障碍",
  ABANDONMENT: "弃购 / 退出",
  NPS: "NPS",
  CSAT: "CSAT",
  PRODUCT_FEEDBACK: "产品满意度",
  CUSTOM: "自定义",
};

const surfaceLabels: Record<string, string> = {
  THANK_YOU: "Thank you",
  ORDER_STATUS: "订单状态",
  THEME_INLINE: "主题内嵌",
  THEME_POPUP: "商品页 / 购物车弹层",
  STANDALONE: "独立链接",
  KLAVIYO_EMAIL: "Klaviyo 邮件",
  KLAVIYO_SMS: "Klaviyo SMS",
};

function mapSurvey(record: {
  id: string;
  name: string;
  kind: string;
  status: string;
  priority: number;
  updatedAt: Date | string;
  placements?: readonly { surface: string; enabled: boolean }[];
}): SurveyRow {
  return {
    id: record.id,
    name: record.name,
    category: categoryLabels[record.kind] ?? record.kind,
    channel: record.placements?.length
      ? record.placements
          .map(
            (placement) =>
              surfaceLabels[placement.surface] ?? placement.surface,
          )
          .join(" · ")
      : "未设置",
    status:
      record.status === "PUBLISHED"
        ? "active"
        : record.status === "PAUSED"
          ? "paused"
          : "draft",
    responses: 0,
    completionRate: 0,
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : record.updatedAt,
    priority: record.priority,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const surveys = await listAdminSurveys(shopDomain);
  const summaries = await Promise.all(
    surveys.map((survey) =>
      analyticsSnapshot(shopDomain, { schemaVersion: 1, surveyId: survey.id }),
    ),
  );
  return {
    rows: surveys.map((survey, index) => ({
      ...mapSurvey(survey),
      responses:
        summaries[index].summary.completions +
        summaries[index].summary.partials,
      completionRate: summaries[index].summary.completionRate * 100,
    })),
  };
};

async function apiRequest<T>(
  url: string,
  body: unknown,
  requestFailed: string,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(payload.error ?? `${requestFailed} (${response.status})`);
  return payload;
}

export default function SurveysRoute() {
  const { t } = useAdminI18n();
  const { rows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <s-page>
      <SurveyListPage
        key={rows.map((row) => `${row.id}:${row.updatedAt}`).join("|")}
        initialRows={rows}
        createAction={
          <s-button href="/app/surveys/new" variant="primary">
            <s-icon type="plus" />
            {t("新建问卷")}
          </s-button>
        }
        onEdit={(id) => navigate(`/app/surveys/${id}`)}
        onDuplicate={async (row) => {
          const payload = await apiRequest<{ survey: SurveyRecord }>(
            `/app/api/surveys/${row.id}`,
            { intent: "duplicate" },
            t("请求失败"),
          );
          return {
            ...mapSurvey(payload.survey),
            channel: row.channel,
            priority: row.priority,
          };
        }}
        onToggleStatus={async (row) => {
          const payload = await apiRequest<{ survey: SurveyRecord }>(
            `/app/api/surveys/${row.id}`,
            {
              intent: "status",
              status: row.status === "active" ? "PAUSED" : "PUBLISHED",
            },
            t("请求失败"),
          );
          const updated = mapSurvey(payload.survey);
          return {
            ...row,
            status: updated.status,
            updatedAt: updated.updatedAt,
          };
        }}
      />
    </s-page>
  );
}
