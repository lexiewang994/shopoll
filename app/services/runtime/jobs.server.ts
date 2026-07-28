import { IntegrationEventStatus, Prisma, RewardStatus, RewardType } from "@prisma/client";
import type { JobHelpers, TaskList } from "graphile-worker";
import db from "../../db.server";
import { calculateNps, calculateRate } from "../../domain";
import {
  INTEGRATION_JOB_NAMES,
  KlaviyoEventsClient,
  ShopifyDiscountClient,
  ShopifyDiscountError,
  parseIntegrationJobPayload,
  type DeliverKlaviyoEventJobPayload,
  type IssueShopifyRewardJobPayload,
  type PurgeRetainedDataJobPayload,
  type SendWeeklyReportJobPayload,
  type ShopifyDiscountRewardRequest,
} from "../integrations";
import { decryptText, encryptText, sha256 } from "../security.server";
import { asJson, deterministicOpaqueToken, isRecord } from "./common.server";

function eventPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!isRecord(value) || value.version !== 1) throw new Error("Invalid integration event payload");
  return value;
}

function klaviyoClient(): KlaviyoEventsClient {
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) throw new Error("KLAVIYO_PRIVATE_API_KEY is not configured");
  return new KlaviyoEventsClient({ apiKey });
}

function deliveryChannel(surface: string): "checkout" | "klaviyo" | "standalone" | "theme" {
  if (surface === "THANK_YOU" || surface === "ORDER_STATUS") return "checkout";
  if (surface === "KLAVIYO_EMAIL" || surface === "KLAVIYO_SMS") return "klaviyo";
  if (surface === "STANDALONE") return "standalone";
  return "theme";
}

function numericAnswer(
  answers: readonly { questionId: string; value: Prisma.JsonValue | null; questionSnapshot: Prisma.JsonValue }[],
  kind: "nps" | "csat",
): number | undefined {
  const answer = answers.find((item) =>
    isRecord(item.questionSnapshot) && item.questionSnapshot.kind === kind && typeof item.value === "number");
  return typeof answer?.value === "number" ? answer.value : undefined;
}

export async function deliverKlaviyoIntegrationEvent(eventId: string): Promise<void> {
  const event = await db.integrationEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === IntegrationEventStatus.SENT || event.status === IntegrationEventStatus.DISCARDED) return;
  const payload = eventPayload(event.payload);
  await db.integrationEvent.update({
    where: { id: event.id },
    data: { status: IntegrationEventStatus.PROCESSING, attempts: { increment: 1 }, errorCode: null },
  });
  try {
    const client = klaviyoClient();
    if (event.eventType === "SURVEY_READY") {
      const inviteId = String(payload.inviteId ?? "");
      const invite = await db.invite.findUnique({
        where: { id: inviteId },
        include: { surveyVersion: { include: { survey: true } } },
      });
      if (!invite?.klaviyoProfileId) {
        await db.integrationEvent.update({ where: { id: event.id }, data: { status: IntegrationEventStatus.DISCARDED, processedAt: new Date(), errorCode: "PROFILE_MISSING" } });
        return;
      }
      const token = deterministicOpaqueToken("klaviyo-invite", invite.idempotencyKey);
      const baseUrl = (process.env.SHOPOLL_PUBLIC_URL || process.env.SHOPIFY_APP_URL || "https://poll.harborinno.com").replace(/\/$/, "");
      const context = isRecord(invite.context) ? invite.context : {};
      const locale = typeof context.locale === "string" ? context.locale : "en";
      await client.sendSurveyReady({
        profile: { id: invite.klaviyoProfileId },
        uniqueId: event.idempotencyKey,
        surveyId: invite.surveyVersion.surveyId,
        surveyVersionId: invite.surveyVersionId,
        channel: "klaviyo",
        locale,
        inviteUrl: `${baseUrl}/s/${encodeURIComponent(token)}?lang=${encodeURIComponent(locale)}`,
        inviteId: invite.id,
      });
    } else if (event.eventType === "SURVEY_STARTED" || event.eventType === "SURVEY_COMPLETED") {
      const responseSessionId = String(payload.responseSessionId ?? "");
      const response = await db.responseSession.findUnique({
        where: { id: responseSessionId },
        include: {
          invite: true,
          answers: true,
          surveyVersion: { include: { survey: true } },
        },
      });
      if (!response?.invite?.klaviyoProfileId) {
        await db.integrationEvent.update({ where: { id: event.id }, data: { status: IntegrationEventStatus.DISCARDED, processedAt: new Date(), errorCode: "PROFILE_MISSING" } });
        return;
      }
      const common = {
        profile: { id: response.invite.klaviyoProfileId },
        uniqueId: event.idempotencyKey,
        surveyId: response.surveyVersion.surveyId,
        surveyVersionId: response.surveyVersionId,
        channel: deliveryChannel(response.surface),
        locale: response.locale,
        responseSessionId: response.id,
      } as const;
      if (event.eventType === "SURVEY_STARTED") {
        await client.sendSurveyStarted(common);
      } else {
        const durationSeconds = response.startedAt && response.completedAt
          ? Math.max(0, Math.round((response.completedAt.getTime() - response.startedAt.getTime()) / 1000))
          : undefined;
        await client.sendSurveyCompleted({
          ...common,
          durationSeconds,
          npsScore: numericAnswer(response.answers, "nps"),
          csatScore: numericAnswer(response.answers, "csat"),
          rewardEligible: Boolean(await db.rewardIssue.findUnique({ where: { responseSessionId: response.id }, select: { id: true } })),
        });
      }
    } else if (event.eventType === "REWARD_ISSUED") {
      const rewardIssueId = String(payload.rewardIssueId ?? "");
      const reward = await db.rewardIssue.findUnique({
        where: { id: rewardIssueId },
        include: {
          responseSession: {
            include: { invite: true, surveyVersion: { include: { survey: true } } },
          },
        },
      });
      if (!reward?.responseSession.invite?.klaviyoProfileId || !reward.codeEncrypted || !reward.expiresAt) {
        await db.integrationEvent.update({ where: { id: event.id }, data: { status: IntegrationEventStatus.DISCARDED, processedAt: new Date(), errorCode: "REWARD_DELIVERY_DATA_MISSING" } });
        return;
      }
      await client.sendRewardIssued({
        profile: { id: reward.responseSession.invite.klaviyoProfileId },
        uniqueId: event.idempotencyKey,
        surveyId: reward.responseSession.surveyVersion.surveyId,
        surveyVersionId: reward.responseSession.surveyVersionId,
        channel: deliveryChannel(reward.responseSession.surface),
        locale: reward.responseSession.locale,
        responseSessionId: reward.responseSession.id,
        rewardIssueId: reward.id,
        rewardType: reward.type === RewardType.PERCENTAGE ? "percentage" : reward.type === RewardType.FIXED_AMOUNT ? "fixed_amount" : "free_shipping",
        code: decryptText(reward.codeEncrypted, "shopoll-reward-code:v1"),
        expiresAt: reward.expiresAt,
      });
    } else {
      await db.integrationEvent.update({ where: { id: event.id }, data: { status: IntegrationEventStatus.DISCARDED, processedAt: new Date(), errorCode: "UNSUPPORTED_EVENT" } });
      return;
    }
    await db.integrationEvent.update({
      where: { id: event.id },
      data: { status: IntegrationEventStatus.SENT, processedAt: new Date(), errorCode: null },
    });
  } catch (error) {
    const attempt = event.attempts + 1;
    const nextAttemptAt = new Date(Date.now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(attempt, 8)));
    await db.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: IntegrationEventStatus.FAILED,
        nextAttemptAt,
        errorCode: error instanceof Error ? error.name.slice(0, 64) : "DELIVERY_ERROR",
      },
    });
    throw error;
  }
}

function rewardRequest(
  code: string,
  snapshot: Prisma.JsonValue,
): ShopifyDiscountRewardRequest {
  if (!isRecord(snapshot)) throw new Error("Reward configuration is invalid");
  const type = String(snapshot.type ?? "");
  const common = {
    code,
    validForDays: typeof snapshot.validForDays === "number" ? snapshot.validForDays : 14,
    minimumSubtotal: typeof snapshot.minimumSubtotal === "string" ? snapshot.minimumSubtotal : undefined,
    appliesToProductIds: Array.isArray(snapshot.appliesToProductIds)
      ? snapshot.appliesToProductIds.filter((item): item is string => typeof item === "string")
      : undefined,
    usageLimit: 1,
    appliesOncePerCustomer: true,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: snapshot.combinesWithShipping === true,
    },
  };
  if (type === RewardType.PERCENTAGE) {
    const percentage = Number(snapshot.value);
    if (!Number.isFinite(percentage)) throw new Error("Percentage reward value is invalid");
    return { ...common, reward: { type: "percentage", percentage } };
  }
  if (type === RewardType.FIXED_AMOUNT) {
    return { ...common, reward: { type: "fixed_amount", amount: String(snapshot.value ?? "") } };
  }
  if (type === RewardType.FREE_SHIPPING) {
    return {
      ...common,
      appliesToProductIds: undefined,
      reward: {
        type: "free_shipping",
        maximumShippingPrice: typeof snapshot.maximumShippingPrice === "string"
          ? snapshot.maximumShippingPrice
          : undefined,
      },
    };
  }
  throw new Error("Reward type is invalid");
}

function duplicateDiscountError(error: unknown): boolean {
  return error instanceof ShopifyDiscountError && error.userErrors.some((item) =>
    ["TAKEN", "CODE_TAKEN", "DUPLICATE"].includes(String(item.code ?? "").toUpperCase())
      || item.message.toLowerCase().includes("already exists"));
}

export async function issueShopifyReward(rewardIssueId: string): Promise<void> {
  const reward = await db.rewardIssue.findUnique({
    where: { id: rewardIssueId },
    include: {
      responseSession: {
        include: { invite: true, surveyVersion: { include: { survey: true } } },
      },
    },
  });
  if (!reward || reward.status === RewardStatus.ISSUED) return;
  const sessions = await db.session.findMany({ where: { isOnline: false }, orderBy: { expires: "desc" } });
  const session = sessions.find((item) => item.shop === reward.responseSession.shopDomain)
    ?? sessions.find((item) => item.shop.endsWith(".myshopify.com"));
  if (!session) throw new Error("Shopify offline session is unavailable");
  const code = `SHOPOLL-${sha256(reward.id).slice(0, 10).toUpperCase()}`;
  let discountNodeId: string | undefined;
  try {
    const result = await new ShopifyDiscountClient({
      shopDomain: session.shop,
      accessToken: session.accessToken,
      apiVersion: "2026-07",
    }).createReward(rewardRequest(code, reward.configSnapshot));
    discountNodeId = result.discountNodeId;
  } catch (error) {
    if (!duplicateDiscountError(error)) {
      await db.rewardIssue.update({
        where: { id: reward.id },
        data: { status: RewardStatus.FAILED, errorCode: error instanceof Error ? error.name.slice(0, 64) : "DISCOUNT_ERROR" },
      });
      throw error;
    }
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.rewardIssue.update({
      where: { id: reward.id },
      data: {
        status: RewardStatus.ISSUED,
        codeEncrypted: encryptText(code, "shopoll-reward-code:v1"),
        codeLast4: code.slice(-4),
        shopifyDiscountGid: discountNodeId,
        issuedAt: now,
        errorCode: null,
      },
    });
    if (reward.responseSession.invite?.klaviyoProfileId) {
      await tx.integrationEvent.upsert({
        where: { idempotencyKey: `klaviyo:reward-issued:${reward.id}` },
        create: {
          shopDomain: reward.responseSession.shopDomain,
          provider: "KLAVIYO",
          eventType: "REWARD_ISSUED",
          idempotencyKey: `klaviyo:reward-issued:${reward.id}`,
          payload: asJson({ version: 1, rewardIssueId: reward.id }),
        },
        update: {},
      });
    }
  });
}

export function topAnswers(
  answers: readonly {
    questionId: string;
    value: Prisma.JsonValue | null;
    questionSnapshot: Prisma.JsonValue;
  }[],
  ids: readonly string[],
  locale: string,
): string[] {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    if (!ids.includes(answer.questionId)) continue;
    const values = Array.isArray(answer.value) ? answer.value : [answer.value];
    for (const value of values) {
      if (typeof value !== "string") continue;
      const snapshot = isRecord(answer.questionSnapshot) ? answer.questionSnapshot : {};
      const option = Array.isArray(snapshot.options)
        ? snapshot.options.find((item) => isRecord(item) && item.id === value)
        : undefined;
      const labelValue = isRecord(option) ? option.label : undefined;
      const localizedLabel = typeof labelValue === "string"
        ? labelValue
        : isRecord(labelValue)
          ? [labelValue[locale], labelValue[locale.split("-")[0]], labelValue.en]
              .find((item): item is string => typeof item === "string" && item.length > 0)
          : undefined;
      const label = localizedLabel ?? value;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([value]) => value);
}

type WeeklyResponse = {
  completedAt: Date | null;
  answers: readonly {
    questionId: string;
    value: Prisma.JsonValue | null;
    questionSnapshot: Prisma.JsonValue;
  }[];
};

const motivationQuestionIds = ["paper7_reason", "bricbloc_reason", "nexus_reason"] as const;
const channelQuestionIds = ["discovery_source"] as const;
const obstacleQuestionIds = ["purchase_barrier", "barrier", "cart_exit_reason"] as const;

function responseProduct(response: WeeklyResponse): "paper7" | "bricbloc" | "nexus" | undefined {
  const explicit = response.answers.find((answer) => answer.questionId === "core_product")?.value;
  if (explicit === "paper7" || explicit === "bricbloc" || explicit === "nexus") return explicit;
  if (response.answers.some((answer) => answer.questionId === "paper7_reason")) return "paper7";
  if (response.answers.some((answer) => answer.questionId === "bricbloc_reason")) return "bricbloc";
  if (response.answers.some((answer) => answer.questionId === "nexus_reason")) return "nexus";
  return undefined;
}

export function productWeeklyBreakdown(
  responses: readonly WeeklyResponse[],
  product: "paper7" | "bricbloc" | "nexus",
  locale: string,
) {
  const matching = responses.filter((response) => responseProduct(response) === product);
  const answers = matching.flatMap((response) => response.answers);
  return {
    responseCount: matching.length,
    topMotivations: topAnswers(answers, [`${product}_reason`], locale),
    topChannels: topAnswers(answers, channelQuestionIds, locale),
    topObstacles: topAnswers(answers, obstacleQuestionIds, locale),
  };
}

function roundedChange(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function sendWeeklyReport(payload: SendWeeklyReportJobPayload): Promise<void> {
  const subscription = await db.reportSubscription.findUnique({ where: { id: payload.reportSubscriptionId } });
  if (!subscription?.enabled) return;
  const start = new Date(payload.periodStart);
  const end = new Date(payload.periodEnd);
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const responses = await db.responseSession.findMany({
    where: { shopDomain: subscription.shopDomain, createdAt: { gte: start, lt: end } },
    include: { answers: true },
  });
  const previousResponses = await db.responseSession.findMany({
    where: { shopDomain: subscription.shopDomain, createdAt: { gte: previousStart, lt: start } },
    include: { answers: true },
  });
  const completed = responses.filter((item) => item.completedAt).length;
  const allAnswers = responses.flatMap((item) => item.answers);
  const previousAnswers = previousResponses.flatMap((item) => item.answers);
  const npsScores = allAnswers.filter((item) => isRecord(item.questionSnapshot) && item.questionSnapshot.kind === "nps" && typeof item.value === "number").map((item) => item.value as number);
  const previousNpsScores = previousAnswers.filter((item) => isRecord(item.questionSnapshot) && item.questionSnapshot.kind === "nps" && typeof item.value === "number").map((item) => item.value as number);
  const failedEvents = await db.integrationEvent.count({
    where: { shopDomain: subscription.shopDomain, status: IntegrationEventStatus.FAILED, createdAt: { gte: start, lt: end } },
  });
  const failedRewards = await db.rewardIssue.count({
    where: {
      status: RewardStatus.FAILED,
      createdAt: { gte: start, lt: end },
      responseSession: { shopDomain: subscription.shopDomain },
    },
  });
  let recipientEmail: string | undefined;
  if (!subscription.klaviyoProfileId) {
    recipientEmail = decryptText(
      subscription.recipientEncrypted,
      `shopoll-report-recipient:${subscription.shopDomain}`,
    );
  }
  const completionRate = calculateRate(completed, responses.length);
  const previousCompletionRate = calculateRate(
    previousResponses.filter((item) => item.completedAt).length,
    previousResponses.length,
  );
  const nps = calculateNps(npsScores);
  const previousNps = calculateNps(previousNpsScores);
  const responseCountChange = responses.length - previousResponses.length;
  const responseCountChangePercent = previousResponses.length === 0
    ? undefined
    : roundedChange((responseCountChange / previousResponses.length) * 100);
  const paper7 = productWeeklyBreakdown(responses, "paper7", subscription.locale);
  const bricbloc = productWeeklyBreakdown(responses, "bricbloc", subscription.locale);
  const nexus = productWeeklyBreakdown(responses, "nexus", subscription.locale);
  const anomalies = [
    ...(failedEvents > 0 ? [subscription.locale === "en"
      ? `${failedEvents} integration deliveries failed`
      : `${failedEvents} 个集成事件发送失败`] : []),
    ...(failedRewards > 0 ? [subscription.locale === "en"
      ? `${failedRewards} rewards failed`
      : `${failedRewards} 个奖励签发失败`] : []),
  ];

  await klaviyoClient().sendWeeklyReport({
    profile: subscription.klaviyoProfileId
      ? { id: subscription.klaviyoProfileId }
      : { email: recipientEmail },
    uniqueId: `weekly:${subscription.id}:${start.toISOString()}`,
    reportSubscriptionId: subscription.id,
    shopDomain: subscription.shopDomain,
    periodStart: start,
    periodEnd: end,
    dashboardUrl: `${(process.env.SHOPIFY_APP_URL || "https://poll.harborinno.com").replace(/\/$/, "")}/app/analytics`,
    responseCount: responses.length,
    previousResponseCount: previousResponses.length,
    responseCountChange,
    responseCountChangePercent,
    completionRate,
    previousCompletionRate,
    completionRateChangePoints: roundedChange((completionRate - previousCompletionRate) * 100),
    nps: nps ?? undefined,
    previousNps: previousNps ?? undefined,
    npsChange: nps === null || previousNps === null ? undefined : roundedChange(nps - previousNps),
    topMotivations: topAnswers(allAnswers, motivationQuestionIds, subscription.locale),
    previousTopMotivations: topAnswers(previousAnswers, motivationQuestionIds, subscription.locale),
    topChannels: topAnswers(allAnswers, channelQuestionIds, subscription.locale),
    previousTopChannels: topAnswers(previousAnswers, channelQuestionIds, subscription.locale),
    topObstacles: topAnswers(allAnswers, obstacleQuestionIds, subscription.locale),
    previousTopObstacles: topAnswers(previousAnswers, obstacleQuestionIds, subscription.locale),
    paper7ResponseCount: paper7.responseCount,
    paper7TopMotivations: paper7.topMotivations,
    paper7TopChannels: paper7.topChannels,
    paper7TopObstacles: paper7.topObstacles,
    bricblocResponseCount: bricbloc.responseCount,
    bricblocTopMotivations: bricbloc.topMotivations,
    bricblocTopChannels: bricbloc.topChannels,
    bricblocTopObstacles: bricbloc.topObstacles,
    nexusResponseCount: nexus.responseCount,
    nexusTopMotivations: nexus.topMotivations,
    nexusTopChannels: nexus.topChannels,
    nexusTopObstacles: nexus.topObstacles,
    failedIntegrationEvents: failedEvents,
    failedRewards,
    anomalies,
  });
}

export async function purgeRetainedData(shopId: string): Promise<void> {
  const shops = shopId === "*"
    ? await db.shop.findMany()
    : await db.shop.findMany({ where: { id: shopId } });
  const now = new Date();
  for (const shop of shops) {
    if (shop.purgeAfter && shop.purgeAfter <= now) {
      await db.$transaction(async (tx) => {
        await tx.pixelEvent.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.orderFact.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.integrationEvent.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.integrationConfig.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.privacyExport.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.auditLog.deleteMany({ where: { shopDomain: shop.domain } });
        await tx.session.deleteMany({ where: { shop: shop.domain } });
        await tx.shop.delete({ where: { id: shop.id } });
      });
      continue;
    }
    const standardCutoff = new Date(now.getTime() - shop.retentionDays * 86_400_000);
    const sensitiveCutoff = new Date(now.getTime() - shop.sensitiveRetentionDays * 86_400_000);
    await db.$transaction([
      db.answer.deleteMany({ where: { isSensitive: true, answeredAt: { lte: sensitiveCutoff }, responseSession: { shopDomain: shop.domain } } }),
      db.responseSession.deleteMany({ where: { shopDomain: shop.domain, createdAt: { lte: standardCutoff } } }),
      db.invite.deleteMany({ where: { surveyVersion: { survey: { shopDomain: shop.domain } }, createdAt: { lte: standardCutoff } } }),
      db.impression.deleteMany({ where: { surveyVersion: { survey: { shopDomain: shop.domain } }, createdAt: { lte: standardCutoff } } }),
      db.orderFact.deleteMany({ where: { shopDomain: shop.domain, orderCreatedAt: { lte: standardCutoff } } }),
      db.pixelEvent.deleteMany({ where: { shopDomain: shop.domain, expiresAt: { lte: now } } }),
      db.privacyExport.deleteMany({ where: { shopDomain: shop.domain, expiresAt: { lte: now } } }),
      db.integrationEvent.deleteMany({
        where: {
          shopDomain: shop.domain,
          createdAt: { lte: standardCutoff },
          status: { in: [IntegrationEventStatus.SENT, IntegrationEventStatus.DISCARDED] },
        },
      }),
      db.auditLog.deleteMany({ where: { shopDomain: shop.domain, createdAt: { lte: standardCutoff } } }),
    ]);
  }
  if (shopId === "*") {
    await db.webhookReceipt.deleteMany({
      where: { processedAt: { lte: new Date(now.getTime() - 730 * 86_400_000) } },
    });
  }
}

export async function dispatchPendingJobs(helpers: Pick<JobHelpers, "addJob">): Promise<void> {
  const now = new Date();
  const [events, rewards] = await Promise.all([
    db.integrationEvent.findMany({
      where: {
        status: { in: [IntegrationEventStatus.PENDING, IntegrationEventStatus.FAILED] },
        nextAttemptAt: { lte: now },
      },
      select: { id: true },
      take: 100,
      orderBy: { createdAt: "asc" },
    }),
    db.rewardIssue.findMany({
      where: { status: { in: [RewardStatus.PENDING, RewardStatus.FAILED] } },
      select: { id: true },
      take: 100,
      orderBy: { createdAt: "asc" },
    }),
  ]);
  for (const event of events) {
    await helpers.addJob(INTEGRATION_JOB_NAMES.deliverKlaviyoEvent, {
      version: 1,
      kind: "deliver-klaviyo-event",
      requestedAt: now.toISOString(),
      integrationEventId: event.id,
    }, { jobKey: `shopoll:event:${event.id}`, jobKeyMode: "unsafe_dedupe", maxAttempts: 12 });
  }
  for (const reward of rewards) {
    await helpers.addJob(INTEGRATION_JOB_NAMES.issueShopifyReward, {
      version: 1,
      kind: "issue-shopify-reward",
      requestedAt: now.toISOString(),
      rewardIssueId: reward.id,
    }, { jobKey: `shopoll:reward:${reward.id}`, jobKeyMode: "unsafe_dedupe", maxAttempts: 8 });
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function isReportDue(
  subscription: { timezone: string; weekday: number; hour: number },
  now: Date,
): boolean {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: subscription.timezone,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return false;
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return WEEKDAY_INDEX[parts.weekday] === subscription.weekday
    && Number(parts.hour) === subscription.hour;
}

export async function scheduleWeeklyReports(helpers: Pick<JobHelpers, "addJob">): Promise<void> {
  const now = new Date();
  const subscriptions = await db.reportSubscription.findMany({ where: { enabled: true } });
  for (const subscription of subscriptions) {
    if (!isReportDue(subscription, now)) continue;
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    await helpers.addJob(INTEGRATION_JOB_NAMES.sendWeeklyReport, {
      version: 1,
      kind: "send-weekly-report",
      requestedAt: now.toISOString(),
      reportSubscriptionId: subscription.id,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    }, { jobKey: `shopoll:weekly:${subscription.id}:${start.toISOString()}`, jobKeyMode: "unsafe_dedupe", maxAttempts: 8 });
  }
}

export const shopollTaskList: TaskList = {
  [INTEGRATION_JOB_NAMES.deliverKlaviyoEvent]: async (rawPayload) => {
    const payload = parseIntegrationJobPayload(rawPayload) as DeliverKlaviyoEventJobPayload;
    if (payload.kind !== "deliver-klaviyo-event") throw new Error("Unexpected integration job payload");
    await deliverKlaviyoIntegrationEvent(payload.integrationEventId);
  },
  [INTEGRATION_JOB_NAMES.issueShopifyReward]: async (rawPayload) => {
    const payload = parseIntegrationJobPayload(rawPayload) as IssueShopifyRewardJobPayload;
    if (payload.kind !== "issue-shopify-reward") throw new Error("Unexpected reward job payload");
    await issueShopifyReward(payload.rewardIssueId);
  },
  [INTEGRATION_JOB_NAMES.sendWeeklyReport]: async (rawPayload) => {
    const payload = parseIntegrationJobPayload(rawPayload) as SendWeeklyReportJobPayload;
    if (payload.kind !== "send-weekly-report") throw new Error("Unexpected weekly report payload");
    await sendWeeklyReport(payload);
  },
  [INTEGRATION_JOB_NAMES.purgeRetainedData]: async (rawPayload) => {
    const payload = parseIntegrationJobPayload(rawPayload) as PurgeRetainedDataJobPayload;
    if (payload.kind !== "purge-retained-data") throw new Error("Unexpected retention job payload");
    await purgeRetainedData(payload.shopId);
  },
  shopoll_dispatch_pending: async (_payload, helpers) => {
    await dispatchPendingJobs(helpers);
  },
  shopoll_schedule_weekly_reports: async (_payload, helpers) => {
    await scheduleWeeklyReports(helpers);
  },
  shopoll_purge_all_retained_data: async () => {
    await purgeRetainedData("*");
  },
};
