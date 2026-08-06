import prismaClientPackage, { type Prisma } from "@prisma/client";
import { stringify } from "csv-stringify/sync";

const { ResponseStatus } = prismaClientPackage;

import {
  calculateCsat,
  calculateNps,
  type AnalyticsFilter,
} from "../domain";
import db from "../db.server";

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function answerText(value: Prisma.JsonValue | null): string {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(String).join(" | ");
  return JSON.stringify(value);
}

export function escapeCsvFormula(value: string): string {
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string | number {
  if (typeof value === "number") return value;
  return escapeCsvFormula(value === null || value === undefined ? "" : String(value));
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function productFactRows(value: Prisma.JsonValue | null | undefined): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(record).filter((item) => Object.keys(item).length > 0);
  const items = record(value).items;
  return Array.isArray(items) ? items.map(record).filter((item) => Object.keys(item).length > 0) : [];
}

function matchesOrderFilter(
  filter: AnalyticsFilter,
  order: {
    market: string | null;
    source: string | null;
    isFirstOrder: boolean | null;
    productFacts: Prisma.JsonValue;
    utm: Prisma.JsonValue | null;
  } | undefined,
  fallbackProductFacts: Prisma.JsonValue | null,
): boolean {
  if (filter.market && order?.market !== filter.market) return false;
  if (filter.source && order?.source !== filter.source) return false;
  if (filter.customerType) {
    if (!order || order.isFirstOrder === null) return false;
    if ((order.isFirstOrder ? "new" : "returning") !== filter.customerType) return false;
  }
  if (filter.productGid || filter.variantGid) {
    const facts = productFactRows(order?.productFacts ?? fallbackProductFacts);
    if (!facts.some((fact) =>
      (!filter.productGid || fact.productGid === filter.productGid)
      && (!filter.variantGid || fact.variantGid === filter.variantGid))) return false;
  }
  const utm = record(order?.utm);
  if (filter.utmSource && (utm.utm_source ?? utm.source) !== filter.utmSource) return false;
  if (filter.utmMedium && (utm.utm_medium ?? utm.medium) !== filter.utmMedium) return false;
  if (filter.utmCampaign && (utm.utm_campaign ?? utm.campaign) !== filter.utmCampaign) return false;
  return true;
}

function snapshotTitle(value: Prisma.JsonValue, locale: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const title = value.title;
  if (typeof title === "string") return title;
  if (typeof title !== "object" || title === null || Array.isArray(title)) return "";
  const language = locale.toLowerCase().split("-")[0];
  const localized = title as Record<string, unknown>;
  return String(localized[language] ?? localized.en ?? "");
}

function dateWhere(filter: AnalyticsFilter) {
  const gte = parseDate(filter.dateFrom);
  const lte = parseDate(filter.dateTo, true);
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}

export async function dashboardSnapshot(shopDomain: string) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const [surveyCount, activeSurveyCount, impressions, sessions, recentAnswers, failures] =
    await Promise.all([
      db.survey.count({ where: { shopDomain, status: { not: "ARCHIVED" } } }),
      db.survey.count({ where: { shopDomain, status: "PUBLISHED" } }),
      db.impression.count({
        where: { surveyVersion: { survey: { shopDomain } }, createdAt: { gte: since } },
      }),
      db.responseSession.findMany({
        where: { shopDomain, createdAt: { gte: since } },
        select: { status: true, startedAt: true, completedAt: true },
      }),
      db.answer.findMany({
        where: {
          isSensitive: false,
          answeredAt: { gte: since },
          responseSession: { shopDomain },
        },
        select: { value: true, questionSnapshot: true },
      }),
      db.integrationEvent.count({
        where: { shopDomain, status: "FAILED", createdAt: { gte: since } },
      }),
    ]);
  const completions = sessions.filter((session) => session.status === ResponseStatus.COMPLETED).length;
  const npsScores: number[] = [];
  const csatScores: number[] = [];
  for (const answer of recentAnswers) {
    if (
      typeof answer.questionSnapshot === "object" &&
      answer.questionSnapshot !== null &&
      !Array.isArray(answer.questionSnapshot)
    ) {
      const kind = String(answer.questionSnapshot.kind ?? "");
      if (kind === "nps" && typeof answer.value === "number") npsScores.push(answer.value);
      if (kind === "csat" && typeof answer.value === "number") csatScores.push(answer.value);
    }
  }
  return {
    windowDays: 30,
    surveyCount,
    activeSurveyCount,
    impressions,
    starts: sessions.filter((session) => session.startedAt).length,
    partials: sessions.filter((session) => session.status === ResponseStatus.PARTIAL).length,
    completions,
    completionRate: sessions.length ? completions / sessions.length : 0,
    nps: calculateNps(npsScores),
    csat: calculateCsat(csatScores),
    failures,
  };
}

export async function analyticsSnapshot(
  shopDomain: string,
  filter: AnalyticsFilter,
) {
  const createdAt = dateWhere(filter);
  const sessions = await db.responseSession.findMany({
    where: {
      shopDomain,
      ...(filter.surveyId
        ? { surveyVersion: { surveyId: filter.surveyId } }
        : {}),
      ...(filter.locale ? { locale: filter.locale } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    include: {
      answers: { where: { isSensitive: false }, orderBy: { answeredAt: "asc" } },
      surveyVersion: { include: { survey: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const orderHashes = sessions
    .map((session) => session.orderGidHash)
    .filter((value): value is string => Boolean(value));
  const orderFacts = await db.orderFact.findMany({
    where: { shopDomain, orderGidHash: { in: orderHashes } },
  });
  const orderByHash = new Map(orderFacts.map((order) => [order.orderGidHash, order]));
  const filtered = sessions.filter((session) => matchesOrderFilter(
    filter,
    session.orderGidHash ? orderByHash.get(session.orderGidHash) : undefined,
    session.productFacts,
  ));
  const orderFiltered = Boolean(filter.productGid || filter.variantGid || filter.market
    || filter.source || filter.utmSource || filter.utmMedium || filter.utmCampaign
    || filter.customerType);
  const impressions = orderFiltered
    ? filtered.length
    : await db.impression.count({
        where: {
          surveyVersion: {
            survey: { shopDomain, ...(filter.surveyId ? { id: filter.surveyId } : {}) },
          },
          ...(createdAt ? { createdAt } : {}),
        },
      });
  const starts = filtered.length;
  const completed = filtered.filter((session) => Boolean(session.completedAt));
  const partials = filtered.filter((session) => !session.completedAt && session.answers.length > 0).length;
  const completionSeconds = completed.flatMap((session) => session.startedAt && session.completedAt
    ? [(session.completedAt.getTime() - session.startedAt.getTime()) / 1000]
    : []).filter((seconds) => seconds >= 0);
  const npsScores: number[] = [];
  const csatPercentages: number[] = [];
  for (const session of filtered) {
    for (const answer of session.answers) {
      const snapshot = record(answer.questionSnapshot);
      if (snapshot.kind === "nps" && typeof answer.value === "number") npsScores.push(answer.value);
      if (snapshot.kind === "csat" && typeof answer.value === "number") {
        const scale = snapshot.scale === 7 ? 7 : 5;
        const percentage = calculateCsat([answer.value], scale);
        if (percentage !== null) csatPercentages.push(percentage);
      }
    }
  }
  const correlatedOrders = new Map<string, (typeof orderFacts)[number]>();
  for (const session of filtered) {
    if (!session.orderGidHash) continue;
    const order = orderByHash.get(session.orderGidHash);
    if (order) correlatedOrders.set(order.orderGidHash, order);
  }
  const revenue = [...correlatedOrders.values()].reduce((sum, order) => sum + Number(order.amount), 0);
  const round = (value: number, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };
  return {
    filter,
    summary: {
      impressions,
      starts,
      partials,
      completions: completed.length,
      startRate: impressions ? round(starts / impressions, 4) : 0,
      completionRate: starts ? round(completed.length / starts, 4) : 0,
      averageCompletionSeconds: completionSeconds.length
        ? round(completionSeconds.reduce((sum, value) => sum + value, 0) / completionSeconds.length, 1)
        : null,
      nps: calculateNps(npsScores),
      csat: csatPercentages.length
        ? round(csatPercentages.reduce((sum, value) => sum + value, 0) / csatPercentages.length, 1)
        : null,
      attributedOrders: correlatedOrders.size,
      attributedRevenue: round(revenue),
      attributedAov: correlatedOrders.size ? round(revenue / correlatedOrders.size) : null,
    },
    sessions: filtered,
    correlationNotice: "Revenue relationships are correlations, not causal attribution.",
  };
}

export async function responseCsv(
  shopDomain: string,
  filter: AnalyticsFilter,
): Promise<string> {
  const createdAt = dateWhere(filter);
  const responses = await db.responseSession.findMany({
    where: {
      shopDomain,
      ...(filter.surveyId ? { surveyVersion: { surveyId: filter.surveyId } } : {}),
      ...(filter.locale ? { locale: filter.locale } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    include: {
      answers: { where: { isSensitive: false }, orderBy: { answeredAt: "asc" } },
      surveyVersion: { include: { survey: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const orderHashes = [...new Set(responses.flatMap((response) => response.orderGidHash ? [response.orderGidHash] : []))];
  const orders = await db.orderFact.findMany({
    where: { shopDomain, orderGidHash: { in: orderHashes } },
  });
  const orderByHash = new Map(orders.map((order) => [order.orderGidHash, order]));
  const filtered = responses.filter((response) => matchesOrderFilter(
    filter,
    response.orderGidHash ? orderByHash.get(response.orderGidHash) : undefined,
    response.productFacts,
  ));
  const rows = filtered.flatMap((response) => {
    const order = response.orderGidHash ? orderByHash.get(response.orderGidHash) : undefined;
    const productFacts = productFactRows(order?.productFacts ?? response.productFacts);
    const utm = record(order?.utm);
    return response.answers.map((answer) => Object.fromEntries(Object.entries({
      response_id: response.id,
      survey: response.surveyVersion.survey.name,
      version: response.surveyVersion.version,
      status: response.status.toLowerCase(),
      locale: response.locale,
      surface: response.surface.toLowerCase(),
      market: order?.market ?? "",
      product_gids: productFacts.flatMap((fact) => typeof fact.productGid === "string" ? [fact.productGid] : []).join(" | "),
      variant_gids: productFacts.flatMap((fact) => typeof fact.variantGid === "string" ? [fact.variantGid] : []).join(" | "),
      source: order?.source ?? "",
      utm_source: utm.utm_source ?? utm.source ?? "",
      utm_medium: utm.utm_medium ?? utm.medium ?? "",
      utm_campaign: utm.utm_campaign ?? utm.campaign ?? "",
      customer_type: order?.isFirstOrder === null || order?.isFirstOrder === undefined
        ? ""
        : order.isFirstOrder ? "new" : "returning",
      order_amount: order?.amount.toString() ?? "",
      currency: order?.currency ?? "",
      question_id: answer.questionId,
      question: snapshotTitle(answer.questionSnapshot, response.locale),
      answer: answerText(answer.value),
      answered_at: answer.answeredAt.toISOString(),
      started_at: response.startedAt?.toISOString() ?? "",
      completed_at: response.completedAt?.toISOString() ?? "",
    }).map(([key, value]) => [key, csvCell(value)])));
  });
  return stringify(rows, {
    header: true,
    columns: [
      "response_id",
      "survey",
      "version",
      "status",
      "locale",
      "surface",
      "market",
      "product_gids",
      "variant_gids",
      "source",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "customer_type",
      "order_amount",
      "currency",
      "question_id",
      "question",
      "answer",
      "answered_at",
      "started_at",
      "completed_at",
    ],
  });
}

