import { createHash } from "node:crypto";
import {
  Prisma,
  Surface,
  SurveyKind,
  SurveyStatus,
} from "@prisma/client";

import { getHarborSurveyTemplate } from "../data";
import {
  assertPublishableSurveyDefinition,
  type SurveyDefinitionV1,
  type SurveyLocale,
} from "../domain";
import db from "../db.server";
import { hashInviteToken } from "./integrations";
import { asJson, deterministicOpaqueToken } from "./runtime/common.server";
import { hashIdentifier } from "./security.server";
import { rewardConfiguration } from "./runtime/public-surveys.server";

const anonymousRewardSurfaces = new Set<Surface>([
  Surface.THEME_INLINE,
  Surface.THEME_POPUP,
  Surface.STANDALONE,
]);

function validatedRewardConfiguration(draft: SurveyDefinitionV1) {
  try {
    return rewardConfiguration(draft);
  } catch (error) {
    throw new Response(
      error instanceof Error ? error.message : "Reward configuration is invalid",
      { status: 422 },
    );
  }
}

function assertRewardAllowedForSurface(
  reward: ReturnType<typeof validatedRewardConfiguration>,
  surface: Surface,
): void {
  if (!reward || !anonymousRewardSurfaces.has(surface)) return;
  if (!reward.anonymousRiskAcknowledged) {
    throw new Response(
      "Acknowledge anonymous reward abuse risk before enabling theme or standalone placements",
      { status: 422 },
    );
  }
  if (reward.type !== "FREE_SHIPPING" && reward.productScope === "core_products") {
    throw new Response(
      "Anonymous rewards cannot infer ordered core products; choose all products or specific product GIDs",
      { status: 422 },
    );
  }
}

const kindByCategory: Record<SurveyDefinitionV1["category"], SurveyKind> = {
  purchase_motivation: SurveyKind.PURCHASE_MOTIVATION,
  purchase_barrier: SurveyKind.PURCHASE_BARRIER,
  cart_exit: SurveyKind.ABANDONMENT,
  abandoned_cart: SurveyKind.ABANDONMENT,
  post_delivery_nps: SurveyKind.NPS,
  product_satisfaction: SurveyKind.PRODUCT_FEEDBACK,
  standalone: SurveyKind.CUSTOM,
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function definition(value: Prisma.JsonValue): SurveyDefinitionV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.questions)
  ) {
    throw new Error("Survey draft does not match SurveyDefinitionV1");
  }
  return value as unknown as SurveyDefinitionV1;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function actorHash(actorId?: string): string | undefined {
  return actorId ? hashIdentifier(actorId, "admin-actor") : undefined;
}

export async function ensureShop(shopDomain: string) {
  return db.shop.upsert({
    where: { domain: shopDomain },
    create: { domain: shopDomain },
    update: { active: true, uninstalledAt: null, purgeAfter: null },
  });
}

export async function listAdminSurveys(shopDomain: string) {
  await ensureShop(shopDomain);
  return db.survey.findMany({
    where: { shopDomain, status: { not: SurveyStatus.ARCHIVED } },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: {
      activeVersion: { select: { version: true, publishedAt: true } },
      placements: { select: { id: true, surface: true, enabled: true, sampleRate: true } },
      _count: { select: { versions: true } },
    },
  });
}

export async function getAdminSurvey(shopDomain: string, surveyId: string) {
  const survey = await db.survey.findFirst({
    where: { id: surveyId, shopDomain },
    include: {
      activeVersion: true,
      versions: { orderBy: { version: "desc" }, take: 20 },
      placements: {
        include: { audienceRules: { orderBy: [{ groupIndex: "asc" }, { sortOrder: "asc" }] } },
      },
    },
  });
  if (!survey) throw new Response("Survey not found", { status: 404 });
  return survey;
}

export async function createSurveyFromTemplate(input: {
  shopDomain: string;
  templateId: string;
  name?: string;
  actorId?: string;
  defaultLocale?: SurveyLocale;
}) {
  await ensureShop(input.shopDomain);
  const source = input.templateId === "blank"
    ? {
        schemaVersion: 1 as const,
        id: "blank",
        version: 1,
        slug: "untitled-survey",
        internalName: "Untitled survey",
        category: "standalone" as const,
        defaultLocale: "en" as const,
        enabledLocales: ["en" as const],
        title: { en: "Harbor Innovations survey" },
        questions: [
          {
            id: "welcome",
            kind: "welcome" as const,
            title: { en: "We would value your feedback" },
            buttonLabel: { en: "Start" },
          },
          {
            id: "end",
            kind: "end" as const,
            title: { en: "Thank you for your feedback" },
          },
        ],
      } satisfies SurveyDefinitionV1
    : getHarborSurveyTemplate(input.templateId);
  if (!source) throw new Response("Template not found", { status: 404 });
  const suffix = Date.now().toString(36);
  const draft: SurveyDefinitionV1 = {
    ...structuredClone(source),
    id: `survey-${suffix}`,
    version: 1,
    slug: `${source.slug}-${suffix}`,
    internalName: input.name?.trim() || source.internalName,
    defaultLocale: input.defaultLocale ?? source.defaultLocale,
    enabledLocales: input.defaultLocale && !source.enabledLocales.includes(input.defaultLocale)
      ? [...source.enabledLocales, input.defaultLocale]
      : source.enabledLocales,
  };
  return db.$transaction(async (tx) => {
    const survey = await tx.survey.create({
      data: {
        shopDomain: input.shopDomain,
        slug: draft.slug,
        name: draft.internalName,
        description: draft.description?.en,
        kind: kindByCategory[draft.category],
        enabledLocales: [...draft.enabledLocales],
        draftDefinition: json(draft),
        createdByHash: actorHash(input.actorId),
      },
    });
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: "survey.created",
        resourceType: "Survey",
        resourceId: survey.id,
        surveyId: survey.id,
        changes: json({ templateId: source.id }),
      },
    });
    return survey;
  });
}

export async function saveSurveyDraft(input: {
  shopDomain: string;
  surveyId: string;
  draft: SurveyDefinitionV1;
  actorId?: string;
}) {
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId, shopDomain: input.shopDomain },
    select: { id: true, activeVersionId: true },
  });
  if (!survey) throw new Response("Survey not found", { status: 404 });
  if (input.draft.schemaVersion !== 1) {
    throw new Response("Unsupported survey schema version", { status: 422 });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.survey.update({
      where: { id: survey.id },
      data: {
        name: input.draft.internalName,
        slug: input.draft.slug,
        description: input.draft.description?.en,
        kind: kindByCategory[input.draft.category],
        enabledLocales: [...input.draft.enabledLocales],
        draftDefinition: json(input.draft),
      },
    });
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: survey.activeVersionId ? "survey.new_draft_saved" : "survey.draft_saved",
        resourceType: "Survey",
        resourceId: survey.id,
        surveyId: survey.id,
      },
    });
    return updated;
  });
}

export async function duplicateSurvey(input: {
  shopDomain: string;
  surveyId: string;
  actorId?: string;
}) {
  const source = await getAdminSurvey(input.shopDomain, input.surveyId);
  const sourceDraft = definition(source.draftDefinition);
  const suffix = Date.now().toString(36);
  const copiedDraft: SurveyDefinitionV1 = {
    ...structuredClone(sourceDraft),
    id: `survey-${suffix}`,
    version: 1,
    slug: `${sourceDraft.slug}-copy-${suffix}`,
    internalName: `${sourceDraft.internalName} copy`,
  };
  return db.$transaction(async (tx) => {
    const copy = await tx.survey.create({
      data: {
        shopDomain: input.shopDomain,
        slug: copiedDraft.slug,
        name: copiedDraft.internalName,
        description: copiedDraft.description?.en,
        kind: kindByCategory[copiedDraft.category],
        enabledLocales: [...copiedDraft.enabledLocales],
        draftDefinition: json(copiedDraft),
        priority: source.priority,
        createdByHash: actorHash(input.actorId),
      },
    });
    for (const placement of source.placements) {
      const created = await tx.placement.create({
        data: {
          surveyId: copy.id,
          surface: placement.surface,
          enabled: false,
          priority: placement.priority,
          triggerConfig: json(placement.triggerConfig),
          styleConfig: json(placement.styleConfig),
          startsAt: placement.startsAt,
          endsAt: placement.endsAt,
          sampleRate: placement.sampleRate,
          frequencyCapDays: placement.frequencyCapDays,
          maxResponses: placement.maxResponses,
        },
      });
      if (placement.audienceRules.length) {
        await tx.audienceRule.createMany({
          data: placement.audienceRules.map((rule) => ({
            placementId: created.id,
            groupIndex: rule.groupIndex,
            groupJoin: rule.groupJoin,
            field: rule.field,
            operator: rule.operator,
            value: json(rule.value),
            sortOrder: rule.sortOrder,
          })),
        });
      }
    }
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: "survey.duplicated",
        resourceType: "Survey",
        resourceId: copy.id,
        surveyId: copy.id,
        changes: json({ sourceSurveyId: source.id }),
      },
    });
    return copy;
  });
}

export async function publishSurvey(input: {
  shopDomain: string;
  surveyId: string;
  actorId?: string;
  releaseNote?: string;
}) {
  return db.$transaction(async (tx) => {
    const survey = await tx.survey.findFirst({
      where: { id: input.surveyId, shopDomain: input.shopDomain },
      include: { activeVersion: true, placements: { select: { surface: true, enabled: true } } },
    });
    if (!survey) throw new Response("Survey not found", { status: 404 });
    const draft = definition(survey.draftDefinition);
    assertPublishableSurveyDefinition(draft);
    const reward = validatedRewardConfiguration(draft);
    survey.placements
      .filter((placement) => placement.enabled)
      .forEach((placement) => assertRewardAllowedForSurface(reward, placement.surface));
    if (draft.questions.some((question) => question.kind === "contact")) {
      const shop = await tx.shop.findUnique({
        where: { domain: input.shopDomain },
        select: { contactQuestionsEnabled: true },
      });
      if (!shop?.contactQuestionsEnabled) {
        throw new Response(
          "Enable contact questions in Settings before publishing this survey",
          { status: 409 },
        );
      }
    }
    const draftChecksum = checksum(draft);
    if (survey.activeVersion?.checksum === draftChecksum) {
      return survey.activeVersion;
    }
    const latest = await tx.surveyVersion.aggregate({
      where: { surveyId: survey.id },
      _max: { version: true },
    });
    const nextVersion = (latest._max.version ?? 0) + 1;
    const immutableDefinition = { ...structuredClone(draft), version: nextVersion };
    const version = await tx.surveyVersion.create({
      data: {
        surveyId: survey.id,
        version: nextVersion,
        schemaVersion: 1,
        definition: json(immutableDefinition),
        checksum: checksum(immutableDefinition),
        releaseNote: input.releaseNote?.trim().slice(0, 500) || null,
      },
    });
    await tx.survey.update({
      where: { id: survey.id },
      data: {
        status: SurveyStatus.PUBLISHED,
        activeVersionId: version.id,
        draftDefinition: json(immutableDefinition),
      },
    });
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: "survey.published",
        resourceType: "SurveyVersion",
        resourceId: version.id,
        surveyId: survey.id,
        changes: json({ version: nextVersion, checksum: version.checksum }),
      },
    });
    return version;
  });
}

export async function setSurveyState(input: {
  shopDomain: string;
  surveyId: string;
  status: "PUBLISHED" | "PAUSED" | "ARCHIVED";
  actorId?: string;
}) {
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId, shopDomain: input.shopDomain },
    select: { id: true, activeVersionId: true },
  });
  if (!survey) throw new Response("Survey not found", { status: 404 });
  if (input.status === "PUBLISHED" && !survey.activeVersionId) {
    throw new Response("Publish a version before activating this survey", { status: 409 });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.survey.update({
      where: { id: survey.id },
      data: { status: input.status },
    });
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: `survey.${input.status.toLowerCase()}`,
        resourceType: "Survey",
        resourceId: survey.id,
        surveyId: survey.id,
      },
    });
    return updated;
  });
}

export async function updatePlacement(input: {
  shopDomain: string;
  surveyId: string;
  surface: Surface;
  enabled: boolean;
  priority: number;
  sampleRate: number;
  frequencyCapDays: number;
  triggerConfig: unknown;
  styleConfig: unknown;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxResponses?: number | null;
  actorId?: string;
}) {
  const survey = await db.survey.findFirst({
    where: { id: input.surveyId, shopDomain: input.shopDomain },
    include: { activeVersion: true },
  });
  if (!survey) throw new Response("Survey not found", { status: 404 });
  if (input.enabled && survey.status !== SurveyStatus.PUBLISHED) {
    throw new Response("Only a published survey can be enabled", { status: 409 });
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new Response("Placement end date must be later than its start date", { status: 422 });
  }
  if (input.maxResponses !== undefined
    && input.maxResponses !== null
    && (!Number.isInteger(input.maxResponses) || input.maxResponses < 1)) {
    throw new Response("Maximum responses must be a positive integer", { status: 422 });
  }
  if (input.enabled && survey.activeVersion) {
    const activeDefinition = definition(survey.activeVersion.definition);
    const reward = validatedRewardConfiguration(activeDefinition);
    assertRewardAllowedForSurface(reward, input.surface);
  }
  const sampleRate = Math.max(0, Math.min(1, input.sampleRate));
  return db.$transaction(async (tx) => {
    const placement = await tx.placement.upsert({
      where: { surveyId_surface: { surveyId: survey.id, surface: input.surface } },
      create: {
        surveyId: survey.id,
        surface: input.surface,
        enabled: input.enabled,
        priority: input.priority,
        sampleRate,
        frequencyCapDays: input.frequencyCapDays,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxResponses: input.maxResponses,
        triggerConfig: json(input.triggerConfig),
        styleConfig: json(input.styleConfig),
      },
      update: {
        enabled: input.enabled,
        priority: input.priority,
        sampleRate,
        frequencyCapDays: input.frequencyCapDays,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        maxResponses: input.maxResponses,
        triggerConfig: json(input.triggerConfig),
        styleConfig: json(input.styleConfig),
      },
    });
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: "placement.updated",
        resourceType: "Placement",
        resourceId: placement.id,
        surveyId: survey.id,
        changes: json({
          surface: input.surface,
          enabled: input.enabled,
          priority: input.priority,
          sampleRate,
        }),
      },
    });
    return placement;
  });
}

export async function createStandaloneInvite(input: {
  shopDomain: string;
  surveyId: string;
  idempotencyKey: string;
  locale?: string;
  expiresInDays?: number;
  actorId?: string;
}) {
  const now = new Date();
  const survey = await db.survey.findFirst({
    where: {
      id: input.surveyId,
      shopDomain: input.shopDomain,
      status: SurveyStatus.PUBLISHED,
      activeVersionId: { not: null },
      shop: { active: true },
    },
    include: {
      activeVersion: true,
      placements: {
        where: { surface: Surface.STANDALONE },
        include: {
          _count: { select: { responses: { where: { status: "COMPLETED" } } } },
        },
      },
    },
  });
  const placement = survey?.placements[0];
  if (!survey?.activeVersion
    || !placement?.enabled
    || (placement.startsAt && placement.startsAt > now)
    || (placement.endsAt && placement.endsAt <= now)
    || (placement.maxResponses !== null && placement._count.responses >= placement.maxResponses)) {
    throw new Response("Enable an active standalone placement before creating links", { status: 409 });
  }
  const externalKey = input.idempotencyKey.trim();
  if (!externalKey || externalKey.length > 255) {
    throw new Response("A valid idempotency key is required", { status: 422 });
  }
  const idempotencyKey = hashIdentifier(
    `${input.shopDomain}:${survey.id}:${externalKey}`,
    "standalone-invite",
  );
  const token = deterministicOpaqueToken("standalone-invite", idempotencyKey);
  const tokenHash = hashInviteToken(token, process.env.SHOPOLL_TOKEN_PEPPER ?? "");
  const expiresInDays = Math.max(1, Math.min(365, Math.trunc(input.expiresInDays ?? 30)));
  const expiresAt = new Date(now.getTime() + expiresInDays * 86_400_000);
  let invite = await db.invite.findUnique({ where: { idempotencyKey } });
  if (invite && invite.surveyVersionId !== survey.activeVersion.id) {
    throw new Response("Idempotency key was already used for another survey version", { status: 409 });
  }
  if (!invite) {
    try {
      invite = await db.$transaction(async (tx) => {
        const created = await tx.invite.create({
          data: {
            surveyVersionId: survey.activeVersion!.id,
            placementId: placement.id,
            surface: Surface.STANDALONE,
            tokenHash,
            context: asJson({ locale: input.locale ?? "en", source: "admin" }),
            idempotencyKey,
            expiresAt,
          },
        });
        await tx.auditLog.create({
          data: {
            shopDomain: input.shopDomain,
            actorHash: actorHash(input.actorId),
            action: "standalone_invite.created",
            resourceType: "Invite",
            resourceId: created.id,
            surveyId: survey.id,
            changes: json({ expiresAt: expiresAt.toISOString() }),
          },
        });
        return created;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      invite = await db.invite.findUnique({ where: { idempotencyKey } });
      if (!invite || invite.surveyVersionId !== survey.activeVersion.id) throw error;
    }
  }
  const baseUrl = (process.env.SHOPOLL_PUBLIC_URL || process.env.SHOPIFY_APP_URL || "https://poll.harborinno.com").replace(/\/$/, "");
  const locale = input.locale ?? "en";
  return {
    inviteId: invite.id,
    inviteUrl: `${baseUrl}/s/${encodeURIComponent(token)}?lang=${encodeURIComponent(locale)}`,
    expiresAt: invite.expiresAt,
  };
}

export interface AudienceRuleInput {
  groupIndex: number;
  groupJoin: "AND" | "OR";
  field: string;
  operator: string;
  value: unknown;
}

export async function replaceAudienceRules(input: {
  shopDomain: string;
  placementId: string;
  rules: readonly AudienceRuleInput[];
  actorId?: string;
}) {
  const placement = await db.placement.findFirst({
    where: { id: input.placementId, survey: { shopDomain: input.shopDomain } },
    select: { id: true, surveyId: true },
  });
  if (!placement) throw new Response("Placement not found", { status: 404 });
  return db.$transaction(async (tx) => {
    await tx.audienceRule.deleteMany({ where: { placementId: placement.id } });
    if (input.rules.length) {
      await tx.audienceRule.createMany({
        data: input.rules.map((rule, index) => ({
          placementId: placement.id,
          groupIndex: Math.max(0, Math.trunc(rule.groupIndex)),
          groupJoin: rule.groupJoin,
          field: rule.field,
          operator: rule.operator,
          value: json(rule.value),
          sortOrder: index,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        shopDomain: input.shopDomain,
        actorHash: actorHash(input.actorId),
        action: "audience.replaced",
        resourceType: "Placement",
        resourceId: placement.id,
        surveyId: placement.surveyId,
        changes: json({ ruleCount: input.rules.length }),
      },
    });
    return { placementId: placement.id, ruleCount: input.rules.length };
  });
}
