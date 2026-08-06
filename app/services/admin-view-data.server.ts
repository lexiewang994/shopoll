import prismaClientPackage, { type Prisma } from "@prisma/client";

const { ResponseStatus } = prismaClientPackage;

import type {
  LiveAnalyticsView,
  LiveBarRow,
  LiveDashboardView,
  LiveIntegrationsView,
  LiveResponseAnswer,
  LiveResponseRow,
  LiveSettingsView,
} from "../components/live-admin-types";
import type { AnalyticsFilter, SurveyDefinitionV1 } from "../domain";
import { calculateCsat, calculateNps } from "../domain";
import db from "../db.server";
import { ensureShop } from "./admin-surveys.server";
import { decryptText } from "./security.server";
import { shopAliases } from "./runtime/common.server";

type JsonRecord = Record<string, unknown>;

const analyticsFilterKeys = [
  "surveyId",
  "productGid",
  "variantGid",
  "market",
  "locale",
  "source",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "dateFrom",
  "dateTo",
] as const;

export function adminAnalyticsFilter(request: Request): {
  filter: AnalyticsFilter;
  current: Record<string, string>;
  query: string;
} {
  const params = new URL(request.url).searchParams;
  const current: Record<string, string> = {};
  for (const key of analyticsFilterKeys) {
    const value = params.get(key)?.trim();
    if (value) current[key] = value;
  }
  const customerType = params.get("customerType");
  if (customerType === "new" || customerType === "returning") {
    current.customerType = customerType;
  }
  return {
    filter: { schemaVersion: 1, ...current } as AnalyticsFilter,
    current,
    query: new URLSearchParams(current).toString(),
  };
}

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function utmValue(
  value: Prisma.JsonValue | null,
  key: "source" | "medium" | "campaign",
): string | undefined {
  const utm = record(value);
  const candidate = utm[`utm_${key}`] ?? utm[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function localized(value: unknown, locale = "en"): string {
  if (typeof value === "string") return value;
  const values = record(value);
  const language = locale.toLowerCase().split("-")[0];
  const candidate = values[language] ?? values.en ?? Object.values(values)[0];
  return typeof candidate === "string" ? candidate : "";
}

function facts(value: Prisma.JsonValue | null): JsonRecord[] {
  if (Array.isArray(value))
    return value.map(record).filter((item) => Object.keys(item).length);
  const items = record(value).items;
  return Array.isArray(items)
    ? items.map(record).filter((item) => Object.keys(item).length)
    : [];
}

function coreProductName(value: unknown): string | undefined {
  const key = String(value ?? "").toLowerCase();
  return key === "paper7"
    ? "Paper7"
    : key === "bricbloc"
      ? "Bricbloc"
      : key === "nexus"
        ? "Nexus"
        : undefined;
}

export function analyticsSessionProduct(
  productFacts: Prisma.JsonValue | null | undefined,
  answers: Array<{ questionId: string; value: Prisma.JsonValue | null }>,
): string {
  const explicit = answers.find(
    (answer) =>
      answer.questionId === "core_product" &&
      coreProductName(answer.value) !== undefined,
  );
  if (explicit) return coreProductName(explicit.value) ?? "—";

  const inferred = [
    ...new Set(
      facts(productFacts ?? null).flatMap((item) => {
        const product = coreProductName(item.productKey);
        return product ? [product] : [];
      }),
    ),
  ];
  return inferred.length === 1 ? inferred[0] : "—";
}

function dateValue(
  value: string | undefined,
  fallback: Date,
  endOfDay = false,
): Date {
  const parsed = value ? new Date(value) : fallback;
  const result = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  if (endOfDay && value && /^\d{4}-\d{2}-\d{2}$/.test(value))
    result.setUTCHours(23, 59, 59, 999);
  return result;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function optionLabel(
  snapshot: Prisma.JsonValue,
  optionId: string,
  locale: string,
): string {
  const options = record(snapshot).options;
  if (!Array.isArray(options)) return optionId;
  const option = options
    .map(record)
    .find((item) => String(item.id) === optionId);
  return localized(option?.label, locale) || optionId;
}

function answerDisplay(
  answer: {
    value: Prisma.JsonValue | null;
    questionSnapshot: Prisma.JsonValue;
  },
  locale: string,
): string {
  const value = answer.value;
  if (value === null) return "—";
  if (Array.isArray(value))
    return value
      .map((item) => optionLabel(answer.questionSnapshot, String(item), locale))
      .join(" · ");
  if (typeof value === "string")
    return optionLabel(answer.questionSnapshot, value, locale);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "—";
}

function percent(value: number, total: number): number {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

export function analyticsChoiceRows(
  answers: Array<{
    questionId: string;
    value: Prisma.JsonValue | null;
    questionSnapshot: Prisma.JsonValue;
    responseSession: { locale: string };
  }>,
  predicate: (questionId: string) => boolean,
): LiveBarRow[] {
  const counts = new Map<string, { label: string; count: number }>();
  let total = 0;
  for (const answer of answers) {
    if (!predicate(answer.questionId)) continue;
    const values = Array.isArray(answer.value) ? answer.value : [answer.value];
    for (const value of values) {
      if (typeof value !== "string") continue;
      const label = optionLabel(answer.questionSnapshot, value, "en");
      const current = counts.get(value);
      counts.set(value, {
        label: current?.label ?? label ?? value,
        count: (current?.count ?? 0) + 1,
      });
      total += 1;
    }
  }
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    )
    .slice(0, 8)
    .map((item) => ({ ...item, value: percent(item.count, total) }));
}

type AnalyticsFunnelSession = {
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  answers: Array<{ idempotencyKey: string | null }>;
};

function isCustomerAnswer(answer: { idempotencyKey: string | null }): boolean {
  return !answer.idempotencyKey?.startsWith("auto:");
}

export function analyticsFunnelCounts(
  sessions: AnalyticsFunnelSession[],
  impressions: number,
): {
  starts: number;
  partials: number;
  completions: number;
  funnel: LiveAnalyticsView["funnel"];
} {
  const starts = sessions.filter(
    (session) => session.startedAt !== null,
  ).length;
  const completions = sessions.filter(
    (session) =>
      session.status === ResponseStatus.COMPLETED ||
      session.completedAt !== null,
  ).length;
  const partials = sessions.filter(
    (session) =>
      session.status !== ResponseStatus.COMPLETED &&
      session.completedAt === null &&
      session.answers.some(isCustomerAnswer),
  ).length;
  const answeredAtLeast = (count: number) =>
    sessions.filter(
      (session) => session.answers.filter(isCustomerAnswer).length >= count,
    ).length;

  return {
    starts,
    partials,
    completions,
    funnel: [
      { label: "曝光", value: impressions, rate: 100 },
      { label: "开始", value: starts, rate: percent(starts, impressions) },
      {
        label: "回答第 1 题",
        value: answeredAtLeast(1),
        rate: percent(answeredAtLeast(1), starts),
      },
      {
        label: "回答第 2 题",
        value: answeredAtLeast(2),
        rate: percent(answeredAtLeast(2), starts),
      },
      { label: "完成", value: completions, rate: percent(completions, starts) },
    ],
  };
}

function questionTitle(snapshot: Prisma.JsonValue, locale: string): string {
  return (
    localized(record(snapshot).title, locale) ||
    String(record(snapshot).id ?? "Question")
  );
}

export async function adminAnalyticsView(
  shopDomain: string,
  filter: AnalyticsFilter,
): Promise<{ view: LiveAnalyticsView; responses: LiveResponseRow[] }> {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 29 * 86_400_000);
  const from = dateValue(filter.dateFrom, defaultFrom);
  const to = dateValue(filter.dateTo, now, true);
  const queried = await db.responseSession.findMany({
    where: {
      shopDomain,
      createdAt: { gte: from, lte: to },
      ...(filter.surveyId
        ? { surveyVersion: { surveyId: filter.surveyId } }
        : {}),
      ...(filter.locale ? { locale: filter.locale } : {}),
    },
    include: {
      answers: {
        where: { isSensitive: false },
        orderBy: { answeredAt: "asc" },
      },
      surveyVersion: { include: { survey: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10_001,
  });
  const truncated = queried.length > 10_000;
  const sessions = truncated ? queried.slice(0, 10_000) : queried;
  const orderHashes = [
    ...new Set(
      sessions
        .map((item) => item.orderGidHash)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const orderFacts = await db.orderFact.findMany({
    where: { shopDomain, orderGidHash: { in: orderHashes } },
  });
  const orderByHash = new Map(
    orderFacts.map((item) => [item.orderGidHash, item]),
  );
  const filtered = sessions.filter((session) => {
    const order = session.orderGidHash
      ? orderByHash.get(session.orderGidHash)
      : undefined;
    if (filter.market && order?.market !== filter.market) return false;
    if (filter.source && order?.source !== filter.source) return false;
    if (
      filter.customerType &&
      (!order ||
        (order.isFirstOrder ? "new" : "returning") !== filter.customerType)
    )
      return false;
    if (filter.productGid || filter.variantGid) {
      const match = facts(order?.productFacts ?? session.productFacts).some(
        (item) =>
          (!filter.productGid || item.productGid === filter.productGid) &&
          (!filter.variantGid || item.variantGid === filter.variantGid),
      );
      if (!match) return false;
    }
    if (
      filter.utmSource &&
      utmValue(order?.utm ?? null, "source") !== filter.utmSource
    )
      return false;
    if (
      filter.utmMedium &&
      utmValue(order?.utm ?? null, "medium") !== filter.utmMedium
    )
      return false;
    if (
      filter.utmCampaign &&
      utmValue(order?.utm ?? null, "campaign") !== filter.utmCampaign
    )
      return false;
    return true;
  });
  const compatibleImpressionFilter = !(
    filter.productGid ||
    filter.variantGid ||
    filter.market ||
    filter.source ||
    filter.utmSource ||
    filter.utmMedium ||
    filter.utmCampaign ||
    filter.customerType
  );
  const impressions = compatibleImpressionFilter
    ? await db.impression.count({
        where: {
          createdAt: { gte: from, lte: to },
          surveyVersion: {
            survey: {
              shopDomain,
              ...(filter.surveyId ? { id: filter.surveyId } : {}),
            },
          },
        },
      })
    : filtered.length;
  const { starts, partials, completions, funnel } = analyticsFunnelCounts(
    filtered,
    impressions,
  );
  const durations = filtered
    .flatMap((item) =>
      item.completedAt && item.startedAt
        ? [(item.completedAt.getTime() - item.startedAt.getTime()) / 1000]
        : [],
    )
    .filter((value) => value >= 0);
  const allAnswers = filtered.flatMap((session) =>
    session.answers.filter(isCustomerAnswer).map((answer) => ({
      ...answer,
      responseSession: { locale: session.locale },
    })),
  );
  const npsScores = allAnswers.flatMap((answer) =>
    record(answer.questionSnapshot).kind === "nps" &&
    typeof answer.value === "number"
      ? [answer.value]
      : [],
  );
  const csatScores = allAnswers.flatMap((answer) =>
    record(answer.questionSnapshot).kind === "csat" &&
    typeof answer.value === "number"
      ? [answer.value]
      : [],
  );
  const correlated = new Map<string, (typeof orderFacts)[number]>();
  for (const session of filtered) {
    if (!session.orderGidHash) continue;
    const fact = orderByHash.get(session.orderGidHash);
    if (fact) correlated.set(fact.orderGidHash, fact);
  }
  const revenue = [...correlated.values()].reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  );
  const currency =
    [...correlated.values()][0]?.currency ?? orderFacts[0]?.currency ?? "USD";
  const summary = {
    impressions,
    starts,
    partials,
    completions,
    startRate: impressions ? starts / impressions : 0,
    completionRate: starts ? completions / starts : 0,
    averageCompletionSeconds: durations.length
      ? Math.round(
          (durations.reduce((sum, value) => sum + value, 0) /
            durations.length) *
            10,
        ) / 10
      : null,
    nps: calculateNps(npsScores),
    csat: calculateCsat(csatScores),
    attributedOrders: correlated.size,
    attributedRevenue: Math.round(revenue * 100) / 100,
    attributedAov: correlated.size
      ? Math.round((revenue / correlated.size) * 100) / 100
      : null,
    currency,
  };
  const trendMap = new Map<string, number>();
  const maxTrendDays = Math.min(
    90,
    Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1),
  );
  for (let offset = maxTrendDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(to.getTime() - offset * 86_400_000);
    trendMap.set(isoDay(day), 0);
  }
  for (const session of filtered) {
    if (!session.completedAt) continue;
    const day = isoDay(session.completedAt);
    if (trendMap.has(day)) trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
  }
  const motivation = analyticsChoiceRows(allAnswers, (id) =>
    /(?:paper7|bricbloc|nexus|purchase)_reason$/.test(id),
  );
  const channel = analyticsChoiceRows(
    allAnswers,
    (id) => id === "discovery_source",
  );
  const barrier = analyticsChoiceRows(
    allAnswers,
    (id) => id === "purchase_barrier" || id === "barrier",
  );
  const productBreakdowns = ["Paper7", "Bricbloc", "Nexus"].map((product) => {
    const productSessions = filtered.filter((session) => {
      const order = session.orderGidHash
        ? orderByHash.get(session.orderGidHash)
        : undefined;
      return (
        analyticsSessionProduct(
          order?.productFacts ?? session.productFacts,
          session.answers,
        ) === product
      );
    });
    const answers = productSessions.flatMap((session) =>
      session.answers.filter(isCustomerAnswer).map((answer) => ({
        ...answer,
        responseSession: { locale: session.locale },
      })),
    );
    return {
      product,
      total: productSessions.length,
      rows: analyticsChoiceRows(
        answers,
        (id) => id === `${product.toLowerCase()}_reason`,
      ).slice(0, 3),
    };
  });
  const questionCounts = new Map<
    string,
    { question: string; count: number; firstAt: number }
  >();
  for (const session of filtered) {
    for (const answer of session.answers.filter(isCustomerAnswer)) {
      const key = `${session.surveyVersionId}:${answer.questionId}`;
      const current = questionCounts.get(key);
      questionCounts.set(key, {
        question: questionTitle(answer.questionSnapshot, session.locale),
        count: (current?.count ?? 0) + 1,
        firstAt: Math.min(
          current?.firstAt ?? answer.answeredAt.getTime(),
          answer.answeredAt.getTime(),
        ),
      });
    }
  }
  const orderedQuestions = [...questionCounts.values()].sort(
    (left, right) => left.firstAt - right.firstAt,
  );
  let previous = starts;
  const questionDropoff = orderedQuestions.slice(0, 30).map((item) => {
    const dropoff = percent(Math.max(0, previous - item.count), previous);
    previous = item.count;
    return {
      question: item.question,
      answered: item.count,
      shareOfStarts: percent(item.count, starts),
      dropoff,
    };
  });
  const responses: LiveResponseRow[] = filtered.slice(0, 200).map((session) => {
    const definition = session.surveyVersion
      .definition as unknown as SurveyDefinitionV1;
    const visibleQuestions = definition.questions.filter(
      (question) => !["welcome", "end", "contact"].includes(question.kind),
    );
    const order = session.orderGidHash
      ? orderByHash.get(session.orderGidHash)
      : undefined;
    const product = analyticsSessionProduct(
      order?.productFacts ?? session.productFacts,
      session.answers,
    );
    const answers: LiveResponseAnswer[] = session.answers
      .filter(isCustomerAnswer)
      .map((answer) => ({
        question: questionTitle(answer.questionSnapshot, session.locale),
        value: answerDisplay(answer, session.locale),
      }));
    return {
      id: session.id,
      survey: session.surveyVersion.survey.name,
      version: session.surveyVersion.version,
      product,
      market: order?.market ?? "—",
      locale: session.locale,
      source: order?.source ?? "—",
      status: session.status,
      answered: answers.length,
      totalQuestions: visibleQuestions.length,
      durationSeconds:
        session.completedAt && session.startedAt
          ? Math.max(
              0,
              Math.round(
                (session.completedAt.getTime() - session.startedAt.getTime()) /
                  1000,
              ),
            )
          : null,
      hasOrder: Boolean(order),
      revenue: order ? Number(order.amount) : null,
      currency: order?.currency ?? currency,
      createdAt: session.createdAt.toISOString(),
      surface: session.surface,
      answers,
    };
  });
  const optionFacts = await db.orderFact.findMany({
    where: { shopDomain, orderCreatedAt: { gte: from, lte: to } },
    select: {
      market: true,
      locale: true,
      source: true,
      utm: true,
      productFacts: true,
    },
    take: 5000,
  });
  const surveys = await db.survey.findMany({
    where: { shopDomain, status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const uniqueOptions = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))]
      .sort()
      .map((value) => ({ value, label: value }));
  const products = new Map<string, string>();
  const variants = new Map<string, string>();
  for (const fact of optionFacts)
    for (const item of facts(fact.productFacts)) {
      const gid = typeof item.productGid === "string" ? item.productGid : "";
      const key =
        typeof item.productKey === "string"
          ? item.productKey
          : (gid.split("/").at(-1) ?? gid);
      const productLabel = coreProductName(key) ?? key;
      if (gid) products.set(gid, productLabel);
      const variantGid =
        typeof item.variantGid === "string" ? item.variantGid : "";
      if (variantGid) {
        const variantId = variantGid.split("/").at(-1) ?? variantGid;
        variants.set(
          variantGid,
          productLabel ? `${productLabel} · ${variantId}` : variantId,
        );
      }
    }
  const view: LiveAnalyticsView = {
    summary,
    dateFrom: isoDay(from),
    dateTo: isoDay(to),
    trend: [...trendMap].map(([label, value]) => ({ label, value })),
    funnel,
    motivation,
    channel,
    barrier,
    productBreakdowns,
    npsHistogram: Array.from(
      { length: 11 },
      (_, score) => npsScores.filter((value) => value === score).length,
    ),
    npsResponses: npsScores.length,
    questionDropoff,
    options: {
      surveys: surveys.map((survey) => ({
        value: survey.id,
        label: survey.name,
      })),
      products: [...products].map(([value, label]) => ({ value, label })),
      variants: [...variants].map(([value, label]) => ({ value, label })),
      markets: uniqueOptions(optionFacts.map((item) => item.market)),
      locales: uniqueOptions([
        ...sessions.map((item) => item.locale),
        ...optionFacts.map((item) => item.locale),
      ]),
      sources: uniqueOptions(optionFacts.map((item) => item.source)),
      utmSources: uniqueOptions(
        optionFacts.map((item) => utmValue(item.utm, "source")),
      ),
      utmMediums: uniqueOptions(
        optionFacts.map((item) => utmValue(item.utm, "medium")),
      ),
      utmCampaigns: uniqueOptions(
        optionFacts.map((item) => utmValue(item.utm, "campaign")),
      ),
    },
    truncated,
  };
  return { view, responses };
}

export async function adminDashboardView(
  shopDomain: string,
): Promise<LiveDashboardView> {
  const { view: analytics } = await adminAnalyticsView(shopDomain, {
    schemaVersion: 1,
  });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    surveyCount,
    activeSurveyCount,
    enabledPlacements,
    failedEvents,
    failedRewards,
    rolloutSurvey,
  ] = await Promise.all([
    db.survey.count({ where: { shopDomain, status: { not: "ARCHIVED" } } }),
    db.survey.count({ where: { shopDomain, status: "PUBLISHED" } }),
    db.placement.count({ where: { enabled: true, survey: { shopDomain } } }),
    db.integrationEvent.count({
      where: { shopDomain, status: "FAILED", updatedAt: { gte: since } },
    }),
    db.rewardIssue.count({
      where: {
        status: "FAILED",
        responseSession: { shopDomain },
        updatedAt: { gte: since },
      },
    }),
    db.survey.findFirst({
      where: { shopDomain, kind: "PURCHASE_MOTIVATION" },
      include: { placements: { orderBy: { priority: "desc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const rolloutPlacement = rolloutSurvey?.placements[0];
  const definition = rolloutSurvey?.draftDefinition
    ? record(rolloutSurvey.draftDefinition)
    : {};
  return {
    analytics,
    health: {
      surveyCount,
      activeSurveyCount,
      enabledPlacements,
      failedEvents,
      failedRewards,
      klaviyoConfigured: Boolean(process.env.KLAVIYO_PRIVATE_API_KEY),
      flowConfigured: Boolean(
        process.env.KLAVIYO_FLOW_SECRET && process.env.KLAVIYO_ALLOWED_FLOW_IDS,
      ),
    },
    rollout: rolloutPlacement
      ? {
          enabled: rolloutPlacement.enabled,
          sampleRate: rolloutPlacement.sampleRate,
          rewardsEnabled: Boolean(record(definition.metadata).rewardEnabled),
        }
      : null,
  };
}

export async function adminIntegrationsView(
  shopDomain: string,
): Promise<LiveIntegrationsView> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [events, placements, weeklyReportsEnabled] = await Promise.all([
    db.integrationEvent.findMany({
      where: { shopDomain, createdAt: { gte: since } },
      select: { eventType: true, status: true, updatedAt: true },
    }),
    db.placement.findMany({
      where: { survey: { shopDomain } },
      select: { surface: true, enabled: true },
    }),
    db.reportSubscription.count({ where: { shopDomain, enabled: true } }),
  ]);
  const grouped = new Map<
    string,
    { event: string; status: string; count: number; lastAt: Date }
  >();
  for (const event of events) {
    const key = `${event.eventType}:${event.status}`;
    const current = grouped.get(key);
    grouped.set(key, {
      event: event.eventType,
      status: event.status,
      count: (current?.count ?? 0) + 1,
      lastAt:
        current && current.lastAt > event.updatedAt
          ? current.lastAt
          : event.updatedAt,
    });
  }
  const placementGroups = new Map<
    string,
    { surface: string; enabled: number; total: number }
  >();
  for (const placement of placements) {
    const current = placementGroups.get(placement.surface) ?? {
      surface: placement.surface,
      enabled: 0,
      total: 0,
    };
    current.total += 1;
    if (placement.enabled) current.enabled += 1;
    placementGroups.set(placement.surface, current);
  }
  return {
    klaviyoConfigured: Boolean(process.env.KLAVIYO_PRIVATE_API_KEY),
    flowConfigured: Boolean(
      process.env.KLAVIYO_FLOW_SECRET && process.env.KLAVIYO_ALLOWED_FLOW_IDS,
    ),
    allowedFlowCount: (process.env.KLAVIYO_ALLOWED_FLOW_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean).length,
    weeklyReportsEnabled: weeklyReportsEnabled > 0,
    events: [...grouped.values()]
      .sort((left, right) => right.lastAt.getTime() - left.lastAt.getTime())
      .map((item) => ({ ...item, lastAt: item.lastAt.toISOString() })),
    placements: [...placementGroups.values()].sort((left, right) =>
      left.surface.localeCompare(right.surface),
    ),
  };
}

export async function adminSettingsView(
  shopDomain: string,
): Promise<LiveSettingsView> {
  const shop = await ensureShop(shopDomain);
  const [reports, privacyExports] = await Promise.all([
    db.reportSubscription.findMany({
      where: { shopDomain },
      orderBy: { createdAt: "asc" },
    }),
    db.privacyExport.findMany({
      where: {
        shopDomain: { in: [...shopAliases(shopDomain)] },
        expiresAt: { gt: new Date() },
      },
      select: { id: true, requestHash: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    shop: {
      domain: shop.domain,
      adminLocale: shop.adminLocale,
      defaultSurveyLocale: shop.defaultSurveyLocale,
      contactQuestionsEnabled: shop.contactQuestionsEnabled,
      timezone: shop.timezone,
      retentionDays: shop.retentionDays,
      sensitiveRetentionDays: shop.sensitiveRetentionDays,
    },
    reports: reports.map((report) => {
      let email = "";
      try {
        email = decryptText(
          report.recipientEncrypted,
          `shopoll-report-recipient:${shopDomain}`,
        );
      } catch {
        // Keep the encrypted value opaque if the key has been rotated.
      }
      return {
        id: report.id,
        email,
        locale: report.locale,
        timezone: report.timezone,
        weekday: report.weekday,
        hour: report.hour,
        enabled: report.enabled,
      };
    }),
    integrations: {
      klaviyo: Boolean(process.env.KLAVIYO_PRIVATE_API_KEY),
      klaviyoFlow: Boolean(
        process.env.KLAVIYO_FLOW_SECRET && process.env.KLAVIYO_ALLOWED_FLOW_IDS,
      ),
      encryption: Boolean(process.env.SHOPOLL_ENCRYPTION_KEY),
    },
    privacyExports: privacyExports.map((item) => ({
      id: item.id,
      requestHash: item.requestHash,
      createdAt: item.createdAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
    })),
  };
}
