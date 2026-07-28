import { createHash } from "node:crypto";
import {
  Prisma,
  ResponseStatus,
  RewardStatus,
  RewardType,
  Surface,
  SurveyStatus,
} from "@prisma/client";
import db from "../../db.server";
import {
  getNextVisibleQuestion,
  computeNextVisibleQuestions,
  hasAnswer,
  isQuestionVisible,
  stableSampleBucket,
  validateAnswerUpsert,
  type AnswerMap,
  type AnswerUpsert,
  type AnswerValue,
  type AudienceContext,
  type AudienceRule,
  type SurveyDefinitionV1,
} from "../../domain";
import {
  hashInviteToken,
  type EncryptedContactValueV1,
  encryptContactValue,
} from "../integrations";
import {
  contactIdentityHash,
  decryptText,
  encryptText,
  hashIdentifier,
  orderConfirmationIdentityHash,
  secureEquals,
} from "../security.server";
import {
  RuntimeError,
  asJson,
  assertConfiguredShopDomain,
  assertIdentityCanAccessShop,
  canonicalJson,
  coreProductsFromFacts,
  deterministicOpaqueToken,
  isRecord,
  normalizeOrderGid,
  optionalString,
  orderIdentityHash,
  parseDefinition,
  payloadDigest,
  publicSurveyDefinition,
  requiredString,
  resolvedLocale,
  safeAttributionValue,
  sanitizedPublicContext,
  shopAliases,
  surfaceFromContext,
  toAudienceContext,
  type PublicIdentity,
} from "./common.server";

type DbClient = Prisma.TransactionClient | typeof db;

interface ResolveInput {
  schemaVersion?: unknown;
  context?: unknown;
  inviteToken?: unknown;
}

interface SessionInput {
  schemaVersion?: unknown;
  surveyId?: unknown;
  surveyVersionId?: unknown;
  placementId?: unknown;
  resumeToken?: unknown;
  inviteToken?: unknown;
  context?: unknown;
  idempotencyKey?: unknown;
}

interface ImpressionInput {
  schemaVersion?: unknown;
  sessionId?: unknown;
  surveyId?: unknown;
  surveyVersionId?: unknown;
  placementId?: unknown;
  resumeToken?: unknown;
  context?: unknown;
  idempotencyKey?: unknown;
}

interface AnswerInput {
  schemaVersion?: unknown;
  questionId?: unknown;
  value?: unknown;
  skipped?: unknown;
  idempotencyKey?: unknown;
  answeredAt?: unknown;
  resumeToken?: unknown;
}

interface CompleteInput {
  schemaVersion?: unknown;
  idempotencyKey?: unknown;
  resumeToken?: unknown;
}

function assertSchemaVersion(value: unknown): void {
  if (value !== undefined && value !== 1) {
    throw new RuntimeError(400, "unsupported_schema", "Only schemaVersion 1 is supported");
  }
}

function uniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findOrderFact(
  rawOrderGid: string | undefined,
  domains: readonly string[],
) {
  if (!rawOrderGid) return null;
  const hashes = domains.map((domain) => orderIdentityHash(domain, rawOrderGid));
  return db.orderFact.findFirst({ where: { orderGidHash: { in: hashes } } });
}

interface CheckoutOrderProofFact {
  shopDomain: string;
  confirmationNumberHash: string | null;
}

export function assertPublicOrderContext(
  identity: PublicIdentity,
  rawContext: Record<string, unknown>,
  orderGid: string | undefined,
  orderFact: CheckoutOrderProofFact | null,
): void {
  const confirmationNumber = optionalString(
    rawContext.orderConfirmationNumber ?? rawContext.confirmationNumber,
    128,
  );
  if (identity.mode === "proxy") {
    if (orderGid || confirmationNumber) {
      throw new RuntimeError(403, "untrusted_order_context", "Theme clients cannot supply order context");
    }
    return;
  }
  if (identity.mode !== "checkout") return;
  if (!orderGid) throw new RuntimeError(400, "order_required", "Checkout surveys require an order GID");
  if (!confirmationNumber) {
    throw new RuntimeError(401, "order_proof_required", "Checkout surveys require the order confirmation number");
  }
  if (!orderFact) return;
  if (!orderFact.confirmationNumberHash) {
    throw new RuntimeError(403, "order_proof_unavailable", "This order cannot be verified for surveys");
  }
  const actual = orderConfirmationIdentityHash(orderFact.shopDomain, confirmationNumber);
  if (!secureEquals(actual, orderFact.confirmationNumberHash)) {
    throw new RuntimeError(403, "order_proof_invalid", "The order confirmation number is invalid");
  }
}

function audienceRule(row: {
  id: string;
  field: string;
  operator: string;
  value: Prisma.JsonValue;
}): AudienceRule | null {
  const fields = new Set([
    "surface", "placementKey", "pageType", "path", "productId", "variantId",
    "collectionIds", "cartProductIds", "orderProductIds", "orderVariantIds",
    "orderAmount", "market", "locale", "customerType", "discountCodes", "source",
    "utmSource", "utmMedium", "utmCampaign", "purchaseCount", "device", "country",
    "elapsedSeconds", "scrollPercent", "event",
  ]);
  const operators = new Set([
    "equals", "not_equals", "contains", "not_contains", "in", "not_in",
    "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal",
    "exists", "not_exists",
  ]);
  if (!fields.has(row.field) || !operators.has(row.operator)) return null;
  return {
    id: row.id,
    field: row.field as AudienceRule["field"],
    operator: row.operator as AudienceRule["operator"],
    value: row.value as AudienceRule["value"],
  };
}

function valueContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return Array.isArray(expected)
      ? expected.every((item) => actual.includes(item))
      : actual.includes(expected);
  }
  return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
}

export function evaluateStoredAudienceRule(
  rule: AudienceRule,
  context: AudienceContext,
): boolean {
  const actual = context[rule.field] as unknown;
  const expected = rule.value;
  switch (rule.operator) {
    case "exists": return actual !== undefined && actual !== null && actual !== "";
    case "not_exists": return actual === undefined || actual === null || actual === "";
    case "equals": return canonicalJson(actual) === canonicalJson(expected);
    case "not_equals": return canonicalJson(actual) !== canonicalJson(expected);
    case "contains": return valueContains(actual, expected);
    case "not_contains": return !valueContains(actual, expected);
    case "in": return Array.isArray(expected) && expected.includes(actual as never);
    case "not_in": return !Array.isArray(expected) || !expected.includes(actual as never);
    case "greater_than": return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "greater_than_or_equal": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "less_than": return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "less_than_or_equal": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
  }
}

export function evaluateStoredAudience(
  rows: readonly {
    id: string;
    groupIndex: number;
    groupJoin: string;
    field: string;
    operator: string;
    value: Prisma.JsonValue;
  }[],
  context: AudienceContext,
): boolean {
  if (rows.length === 0) return true;
  const groups = new Map<number, typeof rows>();
  for (const row of rows) groups.set(row.groupIndex, [...(groups.get(row.groupIndex) ?? []), row]);
  return [...groups.values()].every((group) => {
    const rules = group.map(audienceRule).filter((rule): rule is AudienceRule => Boolean(rule));
    if (rules.length === 0) return false;
    const join = group[0]?.groupJoin.toUpperCase() === "AND" ? "AND" : "OR";
    return join === "AND"
      ? rules.every((rule) => evaluateStoredAudienceRule(rule, context))
      : rules.some((rule) => evaluateStoredAudienceRule(rule, context));
  });
}

function surfaceMatchesIdentity(surface: Surface, identity: PublicIdentity): boolean {
  if (identity.mode === "checkout") return surface === "THANK_YOU" || surface === "ORDER_STATUS";
  if (identity.mode === "proxy") return surface === "THEME_INLINE" || surface === "THEME_POPUP";
  return true;
}

function candidateSamplingPercentage(sampleRate: number): number {
  return Math.max(0, Math.min(100, sampleRate <= 1 ? sampleRate * 100 : sampleRate));
}

function isPurchaseMotivation(definition: SurveyDefinitionV1): boolean {
  return definition.category === "purchase_motivation" || definition.metadata?.productRouting !== undefined;
}

function visitorHash(raw: Record<string, unknown>): string | undefined {
  if (raw.analyticsAllowed !== true && raw.analyticsConsent !== true) return undefined;
  const token = optionalString(raw.visitorToken ?? raw.visitorId, 512);
  return token ? hashIdentifier(token, "analytics-visitor") : undefined;
}

export function mergePixelHistoryContext(
  raw: Record<string, unknown>,
  events: readonly { eventType: string; payload: unknown }[],
): Record<string, unknown> {
  const rawCart = Array.isArray(raw.cartProductIds)
    ? raw.cartProductIds.filter((value): value is string => typeof value === "string")
    : [];
  const cartProductIds = new Set(rawCart);
  const existingUtm = isRecord(raw.utm) ? raw.utm : {};
  const utm: Record<string, unknown> = { ...existingUtm };
  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : {};
    if (event.eventType === "product_added_to_cart") {
      const productGid = optionalString(payload.productGid, 256);
      if (productGid) cartProductIds.add(productGid);
    }
    if (utm.utm_source === undefined && payload.utmSource !== undefined) utm.utm_source = payload.utmSource;
    if (utm.utm_medium === undefined && payload.utmMedium !== undefined) utm.utm_medium = payload.utmMedium;
    if (utm.utm_campaign === undefined && payload.utmCampaign !== undefined) utm.utm_campaign = payload.utmCampaign;
  }
  return {
    ...raw,
    ...(cartProductIds.size ? { cartProductIds: [...cartProductIds] } : {}),
    ...(Object.keys(utm).length ? { utm } : {}),
  };
}

async function contextWithPixelHistory(
  raw: Record<string, unknown>,
  domains: readonly string[],
): Promise<Record<string, unknown>> {
  if (raw.analyticsAllowed !== true && raw.analyticsConsent !== true) return raw;
  const token = optionalString(raw.visitorToken ?? raw.visitorId, 512);
  if (!token) return raw;
  const events = await db.pixelEvent.findMany({
    where: {
      shopDomain: { in: [...domains] },
      visitorHash: hashIdentifier(token, "analytics-visitor"),
      occurredAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: { eventType: true, payload: true },
  });
  return events.length ? mergePixelHistoryContext(raw, events) : raw;
}

async function resolveInvite(
  token: string,
  requestedLocale: string | undefined,
) {
  const tokenHash = hashInviteToken(token, process.env.SHOPOLL_TOKEN_PEPPER ?? "");
  const invite = await db.invite.findUnique({
    where: { tokenHash },
    include: {
      surveyVersion: { include: { survey: { include: { shop: true } } } },
      response: { include: { answers: true } },
    },
  });
  const now = new Date();
  if (!invite
    || !invite.surveyVersion.survey.shop.active
    || invite.surveyVersion.survey.status !== SurveyStatus.PUBLISHED
    || invite.expiresAt <= now) {
    throw new RuntimeError(404, "invite_not_found", "This survey invitation is invalid or expired");
  }
  const placement = await db.placement.findUnique({
    where: {
      surveyId_surface: {
        surveyId: invite.surveyVersion.surveyId,
        surface: invite.surface,
      },
    },
    include: {
      _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED } } } },
    },
  });
  if (!placement
    || !placement.enabled
    || (placement.startsAt && placement.startsAt > now)
    || (placement.endsAt && placement.endsAt <= now)
    || (placement.maxResponses !== null && placement._count.responses >= placement.maxResponses)) {
    throw new RuntimeError(410, "placement_inactive", "This survey invitation is no longer active");
  }
  const definition = parseDefinition(invite.surveyVersion.definition);
  const autoCore = coreProductsFromFacts(invite.productFacts);
  if (isPurchaseMotivation(definition) && autoCore.length === 0) {
    return { eligible: false };
  }
  const response = invite.response;
  return {
    eligible: true,
    survey: {
      id: invite.surveyVersion.survey.id,
      versionId: invite.surveyVersion.id,
      title: publicSurveyDefinition(definition, requestedLocale).title,
      definition: publicSurveyDefinition(definition, requestedLocale, {
        autoCoreProduct: autoCore.length === 1 ? autoCore[0].key : undefined,
      }),
    },
    placement: undefined,
    session: response ? sessionEnvelope(response, deterministicOpaqueToken("response-session", response.dedupeKey)) : undefined,
  };
}

export async function resolvePublicSurvey(
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const input = rawInput as ResolveInput;
  assertSchemaVersion(input.schemaVersion);
  const initialContext = isRecord(input.context) ? input.context : {};
  const requestedLocale = optionalString(initialContext.locale, 32);
  const inviteToken = optionalString(input.inviteToken ?? initialContext.inviteToken, 512);
  if (identity.mode === "standalone") {
    if (!inviteToken) throw new RuntimeError(401, "invite_token_required", "An invite token is required");
    return resolveInvite(inviteToken, requestedLocale);
  }

  const surface = surfaceFromContext(initialContext.surface, initialContext.mode);
  if (identity.shopDomain) assertConfiguredShopDomain(identity.shopDomain);
  if (!surfaceMatchesIdentity(surface, identity)) {
    throw new RuntimeError(403, "surface_mismatch", "This client cannot resolve that surface");
  }
  const domains = shopAliases(identity.shopDomain);
  const rawContext = await contextWithPixelHistory(initialContext, domains);
  const orderGid = normalizeOrderGid(rawContext.orderGid);
  assertPublicOrderContext(identity, rawContext, orderGid, null);
  const orderFact = await findOrderFact(orderGid, domains);
  if (identity.mode === "checkout" && orderGid && !orderFact) {
    return { eligible: false, retryAfterMs: 2000, reason: "order_facts_pending" };
  }
  assertPublicOrderContext(identity, rawContext, orderGid, orderFact);
  const audience = toAudienceContext(rawContext, surface, orderFact);
  const sampleKey = optionalString(rawContext.visitorToken ?? rawContext.visitorId, 512)
    ?? orderGid
    ?? `${Date.now()}:${Math.random()}`;
  const now = new Date();
  const placements = await db.placement.findMany({
    where: {
      surface,
      enabled: true,
      survey: {
        shopDomain: { in: [...domains] },
        status: SurveyStatus.PUBLISHED,
        activeVersionId: { not: null },
        shop: { active: true },
      },
    },
    include: {
      audienceRules: { orderBy: [{ groupIndex: "asc" }, { sortOrder: "asc" }] },
      survey: { include: { activeVersion: true } },
      _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED } } } },
    },
  });

  const eligible = [] as typeof placements;
  const hashedVisitor = visitorHash(rawContext);
  for (const placement of placements) {
    if (!placement.survey.activeVersion) continue;
    if (placement.startsAt && placement.startsAt > now) continue;
    if (placement.endsAt && placement.endsAt <= now) continue;
    if (placement.maxResponses !== null && placement._count.responses >= placement.maxResponses) continue;
    if (!evaluateStoredAudience(placement.audienceRules, audience)) continue;
    const percentage = candidateSamplingPercentage(placement.sampleRate);
    if (percentage <= 0 || (percentage < 100 && stableSampleBucket(sampleKey, placement.surveyId) >= percentage)) continue;
    const definition = parseDefinition(placement.survey.activeVersion.definition);
    const coreProducts = coreProductsFromFacts(orderFact?.productFacts);
    if (isPurchaseMotivation(definition) && orderFact && coreProducts.length === 0) continue;
    if (hashedVisitor && placement.frequencyCapDays > 0) {
      const blockedSince = new Date(now.getTime() - placement.frequencyCapDays * 86_400_000);
      const previous = await db.impression.findFirst({
        where: { placementId: placement.id, visitorHash: hashedVisitor, createdAt: { gte: blockedSince } },
        select: { id: true },
      });
      if (previous) continue;
    }
    eligible.push(placement);
  }

  eligible.sort((left, right) =>
    (right.priority + right.survey.priority) - (left.priority + left.survey.priority)
      || left.id.localeCompare(right.id));
  const selected = eligible[0];
  if (!selected?.survey.activeVersion) return { eligible: false };
  const definition = parseDefinition(selected.survey.activeVersion.definition);
  const coreProducts = coreProductsFromFacts(orderFact?.productFacts);
  const projected = publicSurveyDefinition(definition, requestedLocale, {
    autoCoreProduct: coreProducts.length === 1 ? coreProducts[0].key : undefined,
  });
  return {
    eligible: true,
    survey: {
      id: selected.survey.id,
      versionId: selected.survey.activeVersion.id,
      surveyVersionId: selected.survey.activeVersion.id,
      title: projected.title,
      definition: projected,
    },
    placement: {
      id: selected.id,
      trigger: selected.triggerConfig,
      style: selected.styleConfig,
      frequency: {
        key: selected.id,
        cooldownDays: selected.frequencyCapDays,
      },
    },
  };
}

function sessionEnvelope(
  session: {
    id: string;
    answers?: readonly { questionId: string; value: Prisma.JsonValue | null; isSensitive: boolean }[];
    status?: string;
    completedAt?: Date | null;
  },
  resumeToken?: string,
): Record<string, unknown> {
  return {
    id: session.id,
    sessionId: session.id,
    resumeToken,
    status: session.status?.toLowerCase(),
    completed: session.status === ResponseStatus.COMPLETED || Boolean(session.completedAt),
    answers: session.answers?.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
      sensitive: answer.isSensitive || undefined,
    })) ?? [],
  };
}

async function sessionByResumeToken(token: string) {
  return db.responseSession.findUnique({
    where: { tokenHash: hashIdentifier(token, "public-token") },
    include: { answers: true, surveyVersion: { include: { survey: { include: { shop: true } } } } },
  });
}

function authorizeLoadedSession(
  identity: PublicIdentity,
  session: { shopDomain: string; tokenHash: string },
  resumeToken: unknown,
): void {
  const token = optionalString(resumeToken, 512);
  const actualHash = token ? hashIdentifier(token, "public-token") : "";
  if (!token || !secureEquals(actualHash, session.tokenHash)) {
    throw new RuntimeError(401, "resume_token_required", "A valid response resume token is required");
  }
  if (identity.mode !== "standalone") assertIdentityCanAccessShop(identity, session.shopDomain);
}

async function inviteForToken(token: string) {
  const tokenHash = hashInviteToken(token, process.env.SHOPOLL_TOKEN_PEPPER ?? "");
  return db.invite.findUnique({
    where: { tokenHash },
    include: {
      response: { include: { answers: true } },
      surveyVersion: { include: { survey: { include: { shop: true } } } },
    },
  });
}

export async function createPublicSession(
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const input = rawInput as SessionInput;
  assertSchemaVersion(input.schemaVersion);
  let rawContext = isRecord(input.context) ? input.context : {};
  const resumeToken = optionalString(input.resumeToken, 512);
  if (resumeToken) {
    const resumed = await sessionByResumeToken(resumeToken);
    if (resumed) {
      if (!resumed.surveyVersion.survey.shop.active) {
        throw new RuntimeError(410, "shop_inactive", "This survey is no longer collecting responses");
      }
      authorizeLoadedSession(identity, resumed, resumeToken);
      const requestedVersion = optionalString(input.surveyVersionId, 128);
      if (requestedVersion && requestedVersion !== resumed.surveyVersionId) {
        throw new RuntimeError(409, "resume_version_mismatch", "The saved response belongs to another survey version");
      }
      await db.responseSession.update({ where: { id: resumed.id }, data: { lastSeenAt: new Date() } });
      return sessionEnvelope(resumed, resumeToken);
    }
    throw new RuntimeError(401, "invalid_resume_token", "The response resume token is invalid");
  }

  const inviteToken = optionalString(input.inviteToken ?? rawContext.inviteToken, 512);
  const invite = inviteToken ? await inviteForToken(inviteToken) : null;
  if (identity.mode === "standalone" && !invite) {
    throw new RuntimeError(401, "invite_token_required", "A valid invite token is required");
  }
  if (invite && invite.expiresAt <= new Date()) {
    throw new RuntimeError(410, "invite_expired", "This survey invitation has expired");
  }
  if (invite?.response) {
    const token = deterministicOpaqueToken("response-session", invite.response.dedupeKey);
    return sessionEnvelope(invite.response, token);
  }

  const requestedVersionId = optionalString(input.surveyVersionId, 128);
  const requestedSurveyId = optionalString(input.surveyId, 128);
  const placementId = optionalString(input.placementId, 128);
  if (!invite) {
    if (!requestedVersionId) {
      throw new RuntimeError(400, "invalid_request", "surveyVersionId is required");
    }
    if (!placementId) throw new RuntimeError(409, "placement_required", "An active placement is required");
  }
  const versionId = invite?.surveyVersionId ?? requiredString(requestedVersionId, "surveyVersionId", 128);
  const version = invite?.surveyVersion ?? await db.surveyVersion.findUnique({
    where: { id: versionId },
    include: { survey: { include: { shop: true } } },
  });
  if (!version) throw new RuntimeError(404, "survey_not_found", "Survey version was not found");
  if (!version.survey.shop.active) {
    throw new RuntimeError(410, "shop_inactive", "This survey is no longer collecting responses");
  }
  if (version.survey.status !== SurveyStatus.PUBLISHED) {
    throw new RuntimeError(410, "survey_inactive", "This survey is no longer collecting responses");
  }
  if (!invite) assertIdentityCanAccessShop(identity, version.survey.shopDomain);
  if (requestedSurveyId && requestedSurveyId !== version.surveyId) {
    throw new RuntimeError(409, "survey_version_mismatch", "Survey and version do not match");
  }
  if (!invite && version.survey.activeVersionId !== version.id) {
    throw new RuntimeError(409, "survey_not_published", "This survey version is not active");
  }
  if (!invite && !placementId) {
    throw new RuntimeError(409, "placement_required", "An active placement is required");
  }
  const placement = await db.placement.findFirst({
    where: invite
      ? {
          surveyId: version.surveyId,
          surface: invite.surface,
          ...(invite.placementId ? { id: invite.placementId } : {}),
        }
      : { id: placementId },
    include: {
      _count: {
        select: { responses: { where: { status: ResponseStatus.COMPLETED } } },
      },
    },
  });
  if (!placement
    || placement.surveyId !== version.surveyId
    || (invite && placement.surface !== invite.surface)) {
    throw new RuntimeError(409, "placement_mismatch", "Placement does not belong to this survey");
  }
  const surface = invite?.surface ?? placement.surface;
  if (!invite && !surfaceMatchesIdentity(surface, identity)) {
    throw new RuntimeError(403, "surface_mismatch", "This client cannot start that survey surface");
  }
  if (!invite && surfaceFromContext(rawContext.surface, rawContext.mode) !== surface) {
    throw new RuntimeError(409, "surface_mismatch", "The requested surface does not match this placement");
  }
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 255);
  const dedupeKey = hashIdentifier(`${version.survey.shopDomain}:${idempotencyKey}`, "response-dedupe");
  const token = deterministicOpaqueToken("response-session", dedupeKey);
  const tokenHash = hashIdentifier(token, "public-token");
  const orderGid = normalizeOrderGid(rawContext.orderGid);
  const domains = shopAliases(identity.shopDomain ?? version.survey.shopDomain);
  rawContext = await contextWithPixelHistory(rawContext, domains);
  const orderFact = await findOrderFact(orderGid, domains);
  if (!invite && identity.mode === "checkout" && orderGid && !orderFact) {
    throw new RuntimeError(409, "order_not_ready", "Order facts are still being synchronized");
  }
  if (!invite) assertPublicOrderContext(identity, rawContext, orderGid, orderFact);
  const orderHash = orderFact?.orderGidHash ?? (orderGid ? orderIdentityHash(version.survey.shopDomain, orderGid) : invite?.orderGidHash);
  const definition = parseDefinition(version.definition);
  const locale = resolvedLocale(definition, optionalString(rawContext.locale, 32));
  const coreProducts = coreProductsFromFacts(orderFact?.productFacts ?? invite?.productFacts);
  if (isPurchaseMotivation(definition) && (orderFact || invite?.productFacts) && coreProducts.length === 0) {
    throw new RuntimeError(409, "accessory_only_order", "Purchase motivation is not shown for accessory-only orders");
  }
  const cleanContext = sanitizedPublicContext(rawContext, surface, orderFact);
  const expectedVisitorHash = visitorHash(rawContext);
  const expectedTargetProductGid = coreProducts.length === 1 ? coreProducts[0].productGid : undefined;
  const resolvedOrderGid = orderGid ?? (
    invite?.orderGidEncrypted && invite.orderGidHash
      ? decryptText(invite.orderGidEncrypted, `invite-order:${version.survey.shopDomain}:${invite.orderGidHash}`)
      : undefined
  );
  const encryptedOrderGid = resolvedOrderGid
    ? encryptText(resolvedOrderGid, `response-order:${version.survey.shopDomain}:${orderHash}`)
    : undefined;
  const data = {
    shopDomain: version.survey.shopDomain,
    surveyVersionId: version.id,
    placementId: placement.id,
    inviteId: invite?.id,
    tokenHash,
    dedupeKey,
    surface,
    locale,
    visitorHash: expectedVisitorHash,
    orderGidHash: orderHash,
    orderGidEncrypted: encryptedOrderGid,
    targetProductGid: expectedTargetProductGid,
    productFacts: asJson(orderFact?.productFacts ?? invite?.productFacts ?? []),
    context: asJson(cleanContext),
  } satisfies Prisma.ResponseSessionUncheckedCreateInput;

  type ReplaySession = {
    shopDomain: string;
    surveyVersionId: string;
    placementId: string | null;
    inviteId: string | null;
    surface: Surface;
    locale: string;
    visitorHash: string | null;
    orderGidHash: string | null;
    targetProductGid: string | null;
    context: Prisma.JsonValue;
  };
  const assertExactReplay: (
    existing: ReplaySession | null,
  ) => asserts existing is ReplaySession = (existing) => {
    if (!existing
      || existing.shopDomain !== version.survey.shopDomain
      || existing.surveyVersionId !== version.id
      || existing.placementId !== placement.id
      || existing.inviteId !== (invite?.id ?? null)
      || existing.surface !== surface
      || existing.locale !== locale
      || existing.visitorHash !== (expectedVisitorHash ?? null)
      || existing.orderGidHash !== (orderHash ?? null)
      || existing.targetProductGid !== (expectedTargetProductGid ?? null)
      || canonicalJson(existing.context) !== canonicalJson(cleanContext)) {
      throw new RuntimeError(409, "idempotency_conflict", "Idempotency key was used for another session");
    }
  };

  const existingReplay = await db.responseSession.findUnique({
    where: { dedupeKey },
    include: { answers: true },
  });
  if (existingReplay) {
    assertExactReplay(existingReplay);
    return sessionEnvelope(existingReplay, deterministicOpaqueToken("response-session", existingReplay.dedupeKey));
  }

  const placementExpired = (
    (placement.startsAt !== null && placement.startsAt > new Date()) ||
    (placement.endsAt !== null && placement.endsAt <= new Date()) ||
    (placement.maxResponses !== null && placement._count.responses >= placement.maxResponses)
  );
  if (!placement.enabled || placementExpired) {
    throw new RuntimeError(409, "placement_mismatch", "Placement is not active for this survey");
  }
  if (!invite) {
    const resolution = await resolvePublicSurvey({ schemaVersion: 1, context: rawContext }, identity);
    const resolvedSurvey = isRecord(resolution.survey) ? resolution.survey : {};
    const resolvedPlacement = isRecord(resolution.placement) ? resolution.placement : {};
    if (resolution.eligible !== true
      || resolvedSurvey.versionId !== requestedVersionId
      || resolvedPlacement.id !== placementId
      || (requestedSurveyId && resolvedSurvey.id !== requestedSurveyId)) {
      throw new RuntimeError(409, "survey_not_eligible", "This survey placement is not currently eligible");
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const session = await tx.responseSession.create({ data });
      if (coreProducts.length === 1 && definition.questions.some((question) => question.id === "core_product")) {
        const question = definition.questions.find((item) => item.id === "core_product")!;
        await tx.answer.create({
          data: {
            responseSessionId: session.id,
            questionId: question.id,
            questionSnapshot: asJson(question),
            value: coreProducts[0].key,
            idempotencyKey: `auto:${session.id}:core_product`,
          },
        });
      }
      if (invite) await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return tx.responseSession.findUniqueOrThrow({ where: { id: session.id }, include: { answers: true } });
    });
    return sessionEnvelope(created, token);
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    const existing = await db.responseSession.findUnique({ where: { dedupeKey }, include: { answers: true } });
    const invitedResponse = !existing && invite
      ? await db.responseSession.findUnique({ where: { inviteId: invite.id }, include: { answers: true } })
      : null;
    if (invitedResponse) {
      return sessionEnvelope(
        invitedResponse,
        deterministicOpaqueToken("response-session", invitedResponse.dedupeKey),
      );
    }
    assertExactReplay(existing);
    return sessionEnvelope(existing, deterministicOpaqueToken("response-session", existing.dedupeKey));
  }
}

async function loadAuthorizedSession(
  sessionId: string,
  identity: PublicIdentity,
  resumeToken: unknown,
) {
  const session = await db.responseSession.findUnique({
    where: { id: sessionId },
    include: {
      answers: { orderBy: { answeredAt: "asc" } },
      surveyVersion: { include: { survey: { include: { shop: true } } } },
      invite: true,
      rewardIssue: true,
    },
  });
  if (!session) throw new RuntimeError(404, "session_not_found", "Response session was not found");
  if (!session.surveyVersion.survey.shop.active) {
    throw new RuntimeError(410, "shop_inactive", "This survey is no longer collecting responses");
  }
  authorizeLoadedSession(identity, session, resumeToken);
  return session;
}

async function idempotencyReceipt(
  provider: string,
  topic: string,
  externalId: string,
) {
  return db.webhookReceipt.findUnique({ where: { provider_topic_externalId: { provider, topic, externalId } } });
}

async function assertIdempotencyReplay(
  provider: string,
  topic: string,
  externalId: string,
  digest: string,
): Promise<boolean> {
  const receipt = await idempotencyReceipt(provider, topic, externalId);
  if (!receipt) return false;
  if (receipt.payloadHash !== digest) {
    throw new RuntimeError(409, "idempotency_conflict", "Idempotency key was reused with different data");
  }
  return true;
}

export async function recordPublicImpression(
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const input = rawInput as ImpressionInput;
  assertSchemaVersion(input.schemaVersion);
  const sessionId = requiredString(input.sessionId, "sessionId", 128);
  const session = await loadAuthorizedSession(sessionId, identity, input.resumeToken);
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 255);
  const externalId = `${session.id}:${idempotencyKey}`;
  const digest = payloadDigest({ sessionId, placementId: input.placementId, context: input.context });
  if (await assertIdempotencyReplay("PUBLIC", "IMPRESSION", externalId, digest)) return { recorded: true };
  try {
    await db.$transaction([
      db.webhookReceipt.create({ data: { provider: "PUBLIC", topic: "IMPRESSION", externalId, payloadHash: digest } }),
      db.impression.create({
        data: {
          surveyVersionId: session.surveyVersionId,
          placementId: session.placementId,
          responseSessionId: session.id,
          visitorHash: session.visitorHash,
          surface: session.surface,
          context: asJson(session.context),
        },
      }),
    ]);
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    if (!(await assertIdempotencyReplay("PUBLIC", "IMPRESSION", externalId, digest))) throw error;
  }
  return { recorded: true };
}

function contactEncryptionKey(): Buffer {
  const configured = process.env.SHOPOLL_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SHOPOLL_ENCRYPTION_KEY must be configured in production");
  }
  return createHash("sha256").update(configured || "shopoll-development-encryption-key").digest();
}

function encryptedContactAnswer(
  shopDomain: string,
  sessionId: string,
  questionId: string,
  value: AnswerValue,
): { publicValue: Prisma.InputJsonValue; encryptedValue: string } {
  if (!isRecord(value)) throw new RuntimeError(422, "invalid_answer", "Contact answer is invalid");
  const fields: Record<string, EncryptedContactValueV1> = {};
  const publicValue: Record<string, unknown> = { consent: value.consent === true };
  for (const field of ["email", "phone"] as const) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) continue;
    fields[field] = encryptContactValue(value[field].trim(), contactEncryptionKey(), {
      shopId: shopDomain,
      responseSessionId: sessionId,
      questionId,
      fieldType: field,
    });
    publicValue[field] = "[encrypted]";
  }
  return { publicValue: asJson(publicValue), encryptedValue: JSON.stringify({ version: 1, fields }) };
}

function answerMapFromRows(rows: readonly { questionId: string; value: Prisma.JsonValue | null }[]): AnswerMap {
  return Object.fromEntries(rows.map((answer) => [answer.questionId, answer.value as AnswerValue]));
}

function navigationFor(
  definition: SurveyDefinitionV1,
  questionId: string,
  rows: readonly { questionId: string; value: Prisma.JsonValue | null }[],
) {
  const next = getNextVisibleQuestion(definition, questionId, answerMapFromRows(rows));
  return next ? { nextQuestionId: next.id, complete: false } : { complete: true };
}

export function normalizeClientAnswer(
  question: SurveyDefinitionV1["questions"][number],
  value: unknown,
): AnswerValue {
  if (
    (question.kind === "nps" || question.kind === "csat" || question.kind === "star_rating")
    && typeof value === "string"
    && /^\d+$/.test(value)
  ) {
    return Number(value);
  }
  if (question.kind === "contact" && isRecord(value) && typeof value.value === "string") {
    const field = question.collect[0];
    return {
      ...(field === "email" ? { email: value.value } : { phone: value.value }),
      consent: value.consent === true,
    };
  }
  return value as AnswerValue;
}

async function createKlaviyoLifecycleEvent(
  client: DbClient,
  session: { id: string; shopDomain: string; invite?: { klaviyoProfileId: string | null } | null },
  type: "SURVEY_STARTED" | "SURVEY_COMPLETED",
): Promise<void> {
  if (!session.invite?.klaviyoProfileId) return;
  await client.integrationEvent.upsert({
    where: { idempotencyKey: `klaviyo:${type.toLowerCase()}:${session.id}` },
    create: {
      shopDomain: session.shopDomain,
      provider: "KLAVIYO",
      eventType: type,
      idempotencyKey: `klaviyo:${type.toLowerCase()}:${session.id}`,
      payload: asJson({ version: 1, responseSessionId: session.id }),
    },
    update: {},
  });
}

export async function upsertPublicAnswer(
  sessionIdValue: unknown,
  pathQuestionId: unknown,
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  const sessionId = requiredString(sessionIdValue, "sessionId", 128);
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const input = rawInput as AnswerInput;
  assertSchemaVersion(input.schemaVersion);
  const session = await loadAuthorizedSession(sessionId, identity, input.resumeToken);
  const questionId = requiredString(pathQuestionId ?? input.questionId, "questionId", 128);
  if (pathQuestionId && input.questionId && pathQuestionId !== input.questionId) {
    throw new RuntimeError(409, "question_mismatch", "Question IDs do not match");
  }
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 255);
  const definition = parseDefinition(session.surveyVersion.definition);
  const question = definition.questions.find((item) => item.id === questionId);
  if (!question) throw new RuntimeError(422, "invalid_answer", "The question does not exist");
  const currentAnswers = answerMapFromRows(session.answers);
  const reachable = computeNextVisibleQuestions(definition, null, currentAnswers)
    .some((item) => item.id === questionId);
  if (!reachable || !isQuestionVisible(question, currentAnswers)) {
    throw new RuntimeError(409, "question_not_visible", "The question is not on the current survey path");
  }
  const skipped = input.skipped === true;
  if (skipped && (question.required || question.kind === "welcome" || question.kind === "end")) {
    throw new RuntimeError(422, "question_required", "This question cannot be skipped");
  }
  const normalizedValue = skipped ? undefined : normalizeClientAnswer(question, input.value);
  const clearingContact = !skipped && question.kind === "contact"
    && isRecord(normalizedValue)
    && !optionalString(normalizedValue.email, 320)
    && !optionalString(normalizedValue.phone, 64)
    && normalizedValue.consent !== true;
  const answerInput: AnswerUpsert | undefined = skipped ? undefined : {
      schemaVersion: 1,
      sessionId,
      questionId,
      value: normalizedValue as AnswerValue,
      idempotencyKey,
      answeredAt: optionalString(input.answeredAt, 64),
    };
  if (!skipped && !clearingContact && answerInput) {
    const validation = validateAnswerUpsert(definition, answerInput);
    if (!validation.valid) {
      throw new RuntimeError(422, "invalid_answer", "The answer is invalid", validation.issues);
    }
  }
  const digest = payloadDigest(skipped
    ? { sessionId, questionId, skipped: true }
    : { sessionId, questionId, value: normalizedValue });
  const externalId = `${session.id}:${idempotencyKey}`;
  if (await assertIdempotencyReplay("PUBLIC", "ANSWER", externalId, digest)) {
    const current = await db.answer.findMany({ where: { responseSessionId: session.id }, orderBy: { answeredAt: "asc" } });
    return { navigation: navigationFor(definition, questionId, current), ...navigationFor(definition, questionId, current) };
  }
  if (session.status === ResponseStatus.COMPLETED) {
    throw new RuntimeError(409, "response_completed", "Completed responses cannot be changed");
  }

  const sensitive = !skipped && question.kind === "contact";
  const emailIdentityHash = sensitive && isRecord(normalizedValue)
    && optionalString(normalizedValue.email, 320)
    ? contactIdentityHash(session.shopDomain, "email", String(normalizedValue.email))
    : undefined;
  const phoneIdentityHash = sensitive && isRecord(normalizedValue)
    && optionalString(normalizedValue.phone, 64)
    ? contactIdentityHash(session.shopDomain, "phone", String(normalizedValue.phone))
    : undefined;
  const protectedAnswer = skipped
    ? undefined
    : sensitive
    ? clearingContact
      ? undefined
      : encryptedContactAnswer(session.shopDomain, session.id, questionId, answerInput!.value)
    : { publicValue: asJson(answerInput!.value), encryptedValue: undefined };
  // Client timestamps are informational only; retention and session activity use server time.
  const answeredAt = new Date();
  const prospectiveAnswers: Record<string, AnswerValue | undefined> = {
    ...answerMapFromRows(session.answers),
    [questionId]: skipped || clearingContact ? undefined : normalizedValue,
  };
  const visibleAnswerIds = computeNextVisibleQuestions(definition, null, prospectiveAnswers)
    .filter((item) => item.kind !== "welcome" && item.kind !== "end")
    .map((item) => item.id);
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: { provider: "PUBLIC", topic: "ANSWER", externalId, payloadHash: digest },
      });
      if (skipped || clearingContact) {
        await tx.answer.deleteMany({ where: { responseSessionId: session.id, questionId } });
      } else if (protectedAnswer) {
        await tx.answer.upsert({
          where: { responseSessionId_questionId: { responseSessionId: session.id, questionId } },
          create: {
            responseSessionId: session.id,
            questionId,
            questionSnapshot: asJson(question),
            value: protectedAnswer.publicValue,
            encryptedValue: protectedAnswer.encryptedValue,
            emailIdentityHash,
            phoneIdentityHash,
            isSensitive: sensitive,
            idempotencyKey,
            answeredAt,
          },
          update: {
            questionSnapshot: asJson(question),
            value: protectedAnswer.publicValue,
            encryptedValue: protectedAnswer.encryptedValue,
            emailIdentityHash,
            phoneIdentityHash,
            isSensitive: sensitive,
            idempotencyKey,
            answeredAt,
          },
        });
      }
      await tx.answer.deleteMany({
        where: {
          responseSessionId: session.id,
          questionId: { notIn: visibleAnswerIds },
        },
      });
      await tx.responseSession.update({
        where: { id: session.id },
        data: {
          status: ResponseStatus.PARTIAL,
          startedAt: session.startedAt ?? answeredAt,
          lastSeenAt: answeredAt,
        },
      });
      if (!session.startedAt) await createKlaviyoLifecycleEvent(tx, session, "SURVEY_STARTED");
    });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    if (!(await assertIdempotencyReplay("PUBLIC", "ANSWER", externalId, digest))) throw error;
  }
  const current = await db.answer.findMany({ where: { responseSessionId: session.id }, orderBy: { answeredAt: "asc" } });
  const navigation = navigationFor(definition, questionId, current);
  return { navigation, ...navigation };
}

export interface RewardConfiguration {
  type: typeof RewardType.PERCENTAGE | typeof RewardType.FIXED_AMOUNT | typeof RewardType.FREE_SHIPPING;
  value?: number | string;
  minimumSubtotal?: string;
  validForDays: number;
  appliesToProductIds?: string[];
  productScope: "all_products" | "core_products" | "specific_products";
  combinesWithShipping: boolean;
  anonymousRiskAcknowledged: boolean;
  maximumShippingPrice?: string;
}

export function rewardConfiguration(definition: SurveyDefinitionV1): RewardConfiguration | null {
  const metadata = definition.metadata;
  if (!metadata || metadata.rewardEnabled !== true) return null;
  const type = String(metadata.rewardType ?? "").toLowerCase();
  const rewardType = type === "percentage"
    ? RewardType.PERCENTAGE
    : type === "fixed_amount" || type === "fixed"
      ? RewardType.FIXED_AMOUNT
      : type === "free_shipping"
        ? RewardType.FREE_SHIPPING
        : null;
  if (!rewardType) throw new RuntimeError(500, "invalid_reward_config", "Published reward configuration is invalid");
  const rawValue = metadata.rewardValue;
  const numericValue = typeof rawValue === "number" || typeof rawValue === "string"
    ? Number(rawValue)
    : NaN;
  if (rewardType === RewardType.PERCENTAGE
    && (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 100)) {
    throw new RuntimeError(500, "invalid_reward_config", "Percentage reward must be greater than 0 and at most 100");
  }
  if (rewardType === RewardType.FIXED_AMOUNT
    && (!Number.isFinite(numericValue) || numericValue <= 0)) {
    throw new RuntimeError(500, "invalid_reward_config", "Fixed reward must be greater than 0");
  }
  if (rewardType === RewardType.FREE_SHIPPING
    && rawValue !== undefined
    && (!Number.isFinite(numericValue) || numericValue <= 0)) {
    throw new RuntimeError(500, "invalid_reward_config", "Maximum shipping price must be greater than 0");
  }
  const validForDays = metadata.rewardValidForDays === undefined
    ? 14
    : Number(metadata.rewardValidForDays);
  if (!Number.isInteger(validForDays) || validForDays < 1 || validForDays > 365) {
    throw new RuntimeError(500, "invalid_reward_config", "Reward validity must be between 1 and 365 days");
  }
  const minimumValue = metadata.rewardMinimumSubtotal === undefined
    ? 0
    : Number(metadata.rewardMinimumSubtotal);
  if (!Number.isFinite(minimumValue) || minimumValue < 0) {
    throw new RuntimeError(500, "invalid_reward_config", "Minimum subtotal cannot be negative");
  }
  const productScopeValue = String(metadata.rewardProductScope ?? "core_products");
  if (!["all_products", "core_products", "specific_products"].includes(productScopeValue)) {
    throw new RuntimeError(500, "invalid_reward_config", "Reward product scope is invalid");
  }
  const productScope = productScopeValue as RewardConfiguration["productScope"];
  const configuredProductIds = Array.isArray(metadata.rewardProductIds)
    ? [...new Set(metadata.rewardProductIds.filter((item): item is string =>
        typeof item === "string" && /^gid:\/\/shopify\/Product\/\d+$/.test(item)))]
    : [];
  if (productScope === "specific_products" && configuredProductIds.length === 0) {
    throw new RuntimeError(500, "invalid_reward_config", "At least one Shopify product GID is required");
  }
  return {
    type: rewardType,
    value: rewardType === RewardType.FREE_SHIPPING ? undefined : numericValue,
    minimumSubtotal: minimumValue > 0 ? String(minimumValue) : undefined,
    validForDays,
    appliesToProductIds: productScope === "specific_products" ? configuredProductIds : undefined,
    productScope,
    combinesWithShipping: metadata.rewardCombinesShipping === true,
    anonymousRiskAcknowledged: metadata.rewardAnonymousRisk === true,
    maximumShippingPrice: rewardType === RewardType.FREE_SHIPPING && Number.isFinite(numericValue)
      ? String(numericValue)
      : undefined,
  };
}

export function rewardForSession(
  config: RewardConfiguration,
  session: {
    shopDomain: string;
    inviteId: string | null;
    orderGidHash: string | null;
    surface: Surface;
    productFacts: Prisma.JsonValue | null;
  },
): { config: RewardConfiguration; eligibilityKey: string | null } | null {
  const trustedOrder = session.surface === Surface.THANK_YOU
    || session.surface === Surface.ORDER_STATUS
    || session.inviteId
    ? session.orderGidHash
    : null;
  const eligibilityKey = trustedOrder
    ? hashIdentifier(`order:${session.shopDomain}:${trustedOrder}`, "reward-eligibility")
    : session.inviteId
      ? hashIdentifier(`invite:${session.inviteId}`, "reward-eligibility")
      : null;
  if (!eligibilityKey && !config.anonymousRiskAcknowledged) return null;

  if (config.type === RewardType.FREE_SHIPPING || config.productScope === "all_products") {
    return { config: { ...config, appliesToProductIds: undefined }, eligibilityKey };
  }
  if (config.productScope === "specific_products") {
    return { config, eligibilityKey };
  }
  const productIds = [...new Set(coreProductsFromFacts(session.productFacts)
    .map((product) => product.productGid)
    .filter((productGid): productGid is string => Boolean(productGid)))];
  if (productIds.length === 0) return null;
  return { config: { ...config, appliesToProductIds: productIds }, eligibilityKey };
}

function completionEnvelope(
  definition: SurveyDefinitionV1,
  locale: string,
  reward?: { status: string; codeEncrypted: string | null; expiresAt: Date | null },
): Record<string, unknown> {
  const projected = publicSurveyDefinition(definition, locale);
  const response: Record<string, unknown> = { completion: projected.completion };
  if (reward) {
    const rewardResult: Record<string, unknown> = {
      status: reward.status.toLowerCase(),
      expiresAt: reward.expiresAt?.toISOString(),
    };
    if (reward.status === RewardStatus.ISSUED && reward.codeEncrypted) {
      rewardResult.code = decryptText(reward.codeEncrypted, "shopoll-reward-code:v1");
    }
    response.reward = rewardResult;
  }
  return response;
}

export async function completePublicSession(
  sessionIdValue: unknown,
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  const sessionId = requiredString(sessionIdValue, "sessionId", 128);
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const input = rawInput as CompleteInput;
  assertSchemaVersion(input.schemaVersion);
  const session = await loadAuthorizedSession(sessionId, identity, input.resumeToken);
  const definition = parseDefinition(session.surveyVersion.definition);
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 255);
  const externalId = `${session.id}:${idempotencyKey}`;
  const digest = payloadDigest({ sessionId, action: "complete" });
  if (await assertIdempotencyReplay("PUBLIC", "COMPLETE", externalId, digest)) {
    return completionEnvelope(definition, session.locale, session.rewardIssue ?? undefined);
  }
  if (session.status === ResponseStatus.COMPLETED) {
    return completionEnvelope(definition, session.locale, session.rewardIssue ?? undefined);
  }

  const map = answerMapFromRows(session.answers);
  const missing = computeNextVisibleQuestions(definition, null, map)
    .filter((question) => question.required && question.kind !== "welcome" && question.kind !== "end" && !hasAnswer(map[question.id]))
    .map((question) => question.id);
  if (missing.length > 0) {
    throw new RuntimeError(422, "required_answers_missing", "Required answers are missing", { questionIds: missing });
  }
  const baseRewardConfig = rewardConfiguration(definition);
  const rewardEligibility = baseRewardConfig ? rewardForSession(baseRewardConfig, session) : null;
  const completedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: { provider: "PUBLIC", topic: "COMPLETE", externalId, payloadHash: digest },
      });
      await tx.responseSession.update({
        where: { id: session.id },
        data: { status: ResponseStatus.COMPLETED, completedAt, lastSeenAt: completedAt },
      });
      if (session.inviteId) await tx.invite.update({ where: { id: session.inviteId }, data: { usedAt: completedAt } });
      await createKlaviyoLifecycleEvent(tx, session, "SURVEY_COMPLETED");
      if (rewardEligibility) {
        await tx.rewardIssue.createMany({
          data: [{
            responseSessionId: session.id,
            eligibilityKey: rewardEligibility.eligibilityKey,
            type: rewardEligibility.config.type,
            status: RewardStatus.PENDING,
            configSnapshot: asJson(rewardEligibility.config),
            expiresAt: new Date(completedAt.getTime() + rewardEligibility.config.validForDays * 86_400_000),
          }],
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
    if (!(await assertIdempotencyReplay("PUBLIC", "COMPLETE", externalId, digest))) throw error;
  }
  const rewardIssue = await db.rewardIssue.findUnique({ where: { responseSessionId: session.id } });
  return completionEnvelope(definition, session.locale, rewardIssue ?? undefined);
}

const PIXEL_EVENT_TYPES = new Set([
  "page_viewed",
  "product_viewed",
  "product_added_to_cart",
  "checkout_started",
  "checkout_completed",
]);

function safePixelPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const allowed = new Set([
    "pageType", "path", "productGid", "variantGid", "quantity", "amount", "currency",
    "market", "locale", "source", "utmSource", "utmMedium", "utmCampaign", "cartTokenHash",
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => allowed.has(key) && ["string", "number", "boolean"].includes(typeof item))
    .map(([key, item]) => {
      if (typeof item !== "string") return [key, item];
      if (["source", "utmSource", "utmMedium", "utmCampaign"].includes(key)) {
        return [key, safeAttributionValue(item, 200)];
      }
      if (key === "path") return [key, item.split(/[?#]/, 1)[0].slice(0, 1024)];
      return [key, item.slice(0, 1024)];
    })
    .filter(([, item]) => item !== undefined));
}

export async function recordPixelEvents(
  rawInput: unknown,
  identity: PublicIdentity,
): Promise<Record<string, unknown>> {
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  assertSchemaVersion(rawInput.schemaVersion);
  if (identity.mode === "standalone") throw new RuntimeError(401, "pixel_auth_required", "Pixel events require Shopify authentication");
  if (identity.shopDomain) assertConfiguredShopDomain(identity.shopDomain);
  const analyticsAllowed = rawInput.analyticsAllowed === true || rawInput.analyticsConsent === true;
  if (!analyticsAllowed) return { accepted: 0, ignored: true };
  const token = requiredString(rawInput.visitorToken ?? rawInput.visitorId, "visitorToken", 512);
  const events = Array.isArray(rawInput.events) ? rawInput.events : [rawInput.event].filter(Boolean);
  if (events.length === 0 || events.length > 50) {
    throw new RuntimeError(400, "invalid_events", "Between 1 and 50 pixel events are required");
  }
  const shopDomain = identity.shopDomain ?? shopAliases()[0];
  if (!shopDomain) throw new RuntimeError(400, "shop_required", "Shop domain is required");
  const visitor = hashIdentifier(token, "analytics-visitor");
  let accepted = 0;
  for (const rawEvent of events) {
    if (!isRecord(rawEvent)) continue;
    const eventType = optionalString(rawEvent.type ?? rawEvent.name, 64);
    if (!eventType || !PIXEL_EVENT_TYPES.has(eventType)) continue;
    const occurredAt = new Date(optionalString(rawEvent.occurredAt, 64) ?? Date.now());
    if (Number.isNaN(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 7 * 86_400_000) continue;
    const eventId = requiredString(rawEvent.id ?? rawEvent.eventId, "event.id", 255);
    const externalId = `${shopDomain}:${eventId}`;
    const cleanPayload = safePixelPayload(rawEvent.payload ?? rawEvent.data);
    const digest = payloadDigest({ eventType, occurredAt: occurredAt.toISOString(), cleanPayload });
    if (await assertIdempotencyReplay("PIXEL", eventType, externalId, digest)) continue;
    try {
      await db.$transaction([
        db.webhookReceipt.create({ data: { provider: "PIXEL", topic: eventType, externalId, payloadHash: digest } }),
        db.pixelEvent.create({
          data: {
            shopDomain,
            visitorHash: visitor,
            eventType,
            payload: asJson(cleanPayload),
            occurredAt,
            expiresAt: new Date(occurredAt.getTime() + 730 * 86_400_000),
          },
        }),
      ]);
      accepted += 1;
    } catch (error) {
      if (!uniqueConflict(error)) throw error;
      if (!(await assertIdempotencyReplay("PIXEL", eventType, externalId, digest))) throw error;
    }
  }
  return { accepted };
}

export function runtimeErrorResponse(error: unknown): Response {
  if (error instanceof RuntimeError) {
    return new Response(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }), {
      status: error.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  console.error("Shopoll runtime request failed", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  return new Response(JSON.stringify({ error: { code: "internal_error", message: "The request could not be completed" } }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
