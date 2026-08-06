import { createHash } from "node:crypto";
import prismaClientPackage, {
  type Prisma,
  type Surface,
} from "@prisma/client";
import db from "../../db.server";
import { stableSampleBucket } from "../../domain";
import { coreProductsFromFacts, isRecord, optionalString, normalizeOrderGid, orderIdentityHash, payloadDigest, asJson, RuntimeError, deterministicOpaqueToken, requiredString, safeAttributionValue, shopAliases, configuredShopDomains, assertConfiguredShopDomain, toAudienceContext } from "./common.server";
import { evaluateStoredAudience } from "./public-surveys.server";
import {
  contactIdentityHash,
  encryptText,
  hashIdentifier,
  orderConfirmationIdentityHash,
} from "../security.server";
import {
  decryptContactValue,
  hashInviteToken,
  KlaviyoEventsClient,
  type EncryptedContactValueV1,
} from "../integrations";

const { Prisma: PrismaRuntime, ResponseStatus, SurveyStatus } = prismaClientPackage;

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shopifyGid(type: "Order" | "Product" | "ProductVariant" | "Fulfillment", value: unknown): string | undefined {
  const string = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : optionalString(value, 256);
  if (!string) return undefined;
  if (string.startsWith("gid://shopify/")) return string;
  return /^\d+$/.test(string) ? `gid://shopify/${type}/${string}` : undefined;
}

export function exactCoreProductKey(...values: unknown[]): "paper7" | "bricbloc" | "nexus" | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
    if (normalized === "paper7" || normalized === "paper 7") return "paper7";
    if (normalized === "bricbloc" || normalized === "bric bloc") return "bricbloc";
    if (normalized === "nexus" || normalized === "nexus ai station") return "nexus";
  }
  return undefined;
}

export interface SanitizedOrderFact {
  orderGid: string;
  confirmationNumber?: string;
  orderCreatedAt: Date;
  amount: string;
  currency: string;
  market?: string;
  locale?: string;
  customerOrderIndex?: number;
  isFirstOrder?: boolean;
  productFacts: Array<Record<string, unknown>>;
  utm?: Record<string, string>;
  source?: string;
  discountCodes?: string[];
}

function utmFromLandingSite(value: unknown): Record<string, string> | undefined {
  const landingSite = optionalString(value, 2048);
  if (!landingSite) return undefined;
  try {
    const url = new URL(landingSite, "https://shop.invalid");
    const result: Record<string, string> = {};
    for (const name of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const item = url.searchParams.get(name);
      const safe = safeAttributionValue(item, 200);
      if (safe) result[name] = safe;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

function sanitizedSource(value: unknown): string | undefined {
  const source = optionalString(value, 512);
  if (!source) return undefined;
  try {
    const parsed = new URL(source);
    return safeAttributionValue(`${parsed.hostname}${parsed.pathname}`, 256);
  } catch {
    return safeAttributionValue(source, 256);
  }
}

export function sanitizeShopifyOrder(payload: unknown): SanitizedOrderFact {
  if (!isRecord(payload)) throw new RuntimeError(400, "invalid_order_payload", "Order webhook payload is invalid");
  const orderGid = normalizeOrderGid(payload.admin_graphql_api_id ?? payload.id);
  if (!orderGid) throw new RuntimeError(400, "invalid_order_payload", "Order ID is missing");
  const amount = numberValue(payload.current_total_price ?? payload.total_price);
  if (amount === undefined || amount < 0) throw new RuntimeError(400, "invalid_order_payload", "Order total is invalid");
  const created = new Date(optionalString(payload.created_at, 64) ?? Date.now());
  if (Number.isNaN(created.getTime())) throw new RuntimeError(400, "invalid_order_payload", "Order date is invalid");
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items.filter(isRecord) : [];
  const productFacts = lineItems.slice(0, 250).map((line) => {
    const productGid = shopifyGid("Product", line.product_id);
    const variantGid = shopifyGid("ProductVariant", line.variant_id);
    const productKey = exactCoreProductKey(
      line.productKey,
      line.product_key,
      line.name,
      line.title,
      line.variant_title,
      line.sku,
    );
    return Object.fromEntries(Object.entries({
      productGid,
      variantGid,
      productKey,
      quantity: Math.max(0, Math.trunc(numberValue(line.quantity) ?? 0)),
      amount: optionalString(line.price, 64),
    }).filter(([, value]) => value !== undefined));
  });
  const customer = isRecord(payload.customer) ? payload.customer : {};
  const orderIndex = numberValue(customer.orders_count);
  const market = isRecord(payload.market) ? optionalString(payload.market.id ?? payload.market.handle, 128) : optionalString(payload.market_id, 128);
  const discountCodes = Array.isArray(payload.discount_codes)
    ? payload.discount_codes.filter(isRecord).map((item) => optionalString(item.code, 128)).filter((item): item is string => Boolean(item))
    : undefined;
  return {
    orderGid,
    confirmationNumber: optionalString(payload.confirmation_number, 128),
    orderCreatedAt: created,
    amount: amount.toFixed(2),
    currency: optionalString(payload.currency, 8) ?? "USD",
    market,
    locale: optionalString(payload.customer_locale ?? payload.locale, 32),
    customerOrderIndex: orderIndex === undefined ? undefined : Math.max(1, Math.trunc(orderIndex)),
    isFirstOrder: orderIndex === undefined ? undefined : orderIndex <= 1,
    productFacts,
    utm: utmFromLandingSite(payload.landing_site),
    source: sanitizedSource(payload.source_name ?? payload.referring_site),
    discountCodes,
  };
}

interface CoreProductMapping {
  productKey: string;
  productGid: string | null;
  handle: string | null;
  isCore: boolean;
}

function productRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) && Array.isArray(value.items) ? value.items.filter(isRecord) : [];
}

export function applyProductMappings(
  value: unknown,
  mappings: readonly CoreProductMapping[],
): unknown {
  const byGid = new Map(
    mappings
      .filter((mapping) => mapping.isCore && mapping.productGid)
      .map((mapping) => [mapping.productGid as string, mapping.productKey]),
  );
  const byHandle = new Map(
    mappings
      .filter((mapping) => mapping.isCore && mapping.handle)
      .map((mapping) => [(mapping.handle as string).toLowerCase(), mapping.productKey]),
  );
  const enrich = (row: Record<string, unknown>): Record<string, unknown> => {
    const productGid = optionalString(row.productGid, 256);
    const handle = optionalString(row.handle, 255)?.toLowerCase();
    const mappedKey = (productGid ? byGid.get(productGid) : undefined)
      ?? (handle ? byHandle.get(handle) : undefined);
    const productKey = exactCoreProductKey(mappedKey, row.productKey);
    const safeRow = { ...row };
    delete safeRow.productKey;
    return productKey ? { ...safeRow, productKey } : safeRow;
  };
  if (Array.isArray(value)) return productRows(value).map(enrich);
  if (isRecord(value) && Array.isArray(value.items)) {
    return { ...value, items: productRows(value).map(enrich) };
  }
  return value;
}

async function enrichProductFactsWithMappings(
  shopDomain: string,
  value: unknown,
): Promise<unknown> {
  if (productRows(value).length === 0) return value;
  const mappings = await db.productMapping.findMany({
    where: {
      shopDomain: { in: [...shopAliases(shopDomain)] },
      isCore: true,
    },
    select: { productKey: true, productGid: true, handle: true, isCore: true },
  });
  return applyProductMappings(value, mappings);
}

function isUnique(error: unknown): boolean {
  return error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function ingestOrderWebhook(input: {
  shopDomain: string;
  topic: string;
  webhookId: string;
  payload: unknown;
}): Promise<{ duplicate: boolean; orderGidHash: string }> {
  const shopDomain = input.shopDomain.toLowerCase();
  assertConfiguredShopDomain(shopDomain);
  const sanitized = sanitizeShopifyOrder(input.payload);
  const fact: SanitizedOrderFact = {
    ...sanitized,
    productFacts: await enrichProductFactsWithMappings(
      shopDomain,
      sanitized.productFacts,
    ) as Array<Record<string, unknown>>,
  };
  const hash = orderIdentityHash(shopDomain, fact.orderGid);
  const encrypted = encryptText(fact.orderGid, `order-fact:${shopDomain}:${hash}`);
  const confirmationNumberHash = fact.confirmationNumber
    ? orderConfirmationIdentityHash(shopDomain, fact.confirmationNumber)
    : undefined;
  const digest = payloadDigest(input.payload);
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: { provider: "SHOPIFY", topic: input.topic, externalId: input.webhookId, payloadHash: digest },
      });
      await tx.shop.upsert({
        where: { domain: shopDomain },
        create: { domain: shopDomain },
        update: {},
      });
      await tx.orderFact.upsert({
        where: { orderGidHash: hash },
        create: {
          shopDomain,
          orderGidHash: hash,
          orderGidEncrypted: encrypted,
          confirmationNumberHash,
          orderCreatedAt: fact.orderCreatedAt,
          amount: fact.amount,
          currency: fact.currency,
          market: fact.market,
          locale: fact.locale,
          customerOrderIndex: fact.customerOrderIndex,
          isFirstOrder: fact.isFirstOrder,
          productFacts: asJson(fact.productFacts),
          utm: fact.utm ? asJson(fact.utm) : undefined,
          source: fact.source,
          discountCodes: fact.discountCodes ? asJson(fact.discountCodes) : undefined,
        },
        update: {
          confirmationNumberHash,
          orderCreatedAt: fact.orderCreatedAt,
          amount: fact.amount,
          currency: fact.currency,
          market: fact.market,
          locale: fact.locale,
          customerOrderIndex: fact.customerOrderIndex,
          isFirstOrder: fact.isFirstOrder,
          productFacts: asJson(fact.productFacts),
          utm: fact.utm ? asJson(fact.utm) : undefined,
          source: fact.source,
          discountCodes: fact.discountCodes ? asJson(fact.discountCodes) : undefined,
          syncedAt: new Date(),
        },
      });
    });
    return { duplicate: false, orderGidHash: hash };
  } catch (error) {
    if (!isUnique(error)) throw error;
    const receipt = await db.webhookReceipt.findUnique({
      where: { provider_topic_externalId: { provider: "SHOPIFY", topic: input.topic, externalId: input.webhookId } },
    });
    if (!receipt || receipt.payloadHash !== digest) {
      throw new RuntimeError(409, "webhook_id_conflict", "Webhook ID was reused with different data");
    }
    return { duplicate: true, orderGidHash: hash };
  }
}

export function sanitizeFulfillment(payload: unknown): {
  orderGid: string;
  fulfillment: Record<string, unknown>;
} {
  if (!isRecord(payload)) throw new RuntimeError(400, "invalid_fulfillment_payload", "Fulfillment payload is invalid");
  const orderGid = normalizeOrderGid(payload.order_id ?? (isRecord(payload.order) ? payload.order.admin_graphql_api_id ?? payload.order.id : undefined));
  if (!orderGid) throw new RuntimeError(400, "invalid_fulfillment_payload", "Fulfillment order ID is missing");
  return {
    orderGid,
    fulfillment: Object.fromEntries(Object.entries({
      fulfillmentGid: shopifyGid("Fulfillment", payload.admin_graphql_api_id ?? payload.id),
      status: optionalString(payload.status, 64),
      shipmentStatus: optionalString(payload.shipment_status, 64),
      updatedAt: optionalString(payload.updated_at ?? payload.created_at, 64),
    }).filter(([, value]) => value !== undefined)),
  };
}

export async function ingestFulfillmentWebhook(input: {
  shopDomain: string;
  topic: string;
  webhookId: string;
  payload: unknown;
}): Promise<{ duplicate: boolean; foundOrder: boolean }> {
  const shopDomain = input.shopDomain.toLowerCase();
  assertConfiguredShopDomain(shopDomain);
  const sanitized = sanitizeFulfillment(input.payload);
  const hash = orderIdentityHash(shopDomain, sanitized.orderGid);
  const digest = payloadDigest(input.payload);
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: { provider: "SHOPIFY", topic: input.topic, externalId: input.webhookId, payloadHash: digest },
      });
      const existing = await tx.orderFact.findUnique({ where: { orderGidHash: hash } });
      if (!existing) return false;
      const current = Array.isArray(existing.productFacts)
        ? { items: existing.productFacts }
        : isRecord(existing.productFacts) ? existing.productFacts : { items: [] };
      await tx.orderFact.update({
        where: { orderGidHash: hash },
        data: {
          productFacts: asJson({ ...current, fulfillment: sanitized.fulfillment }),
          syncedAt: new Date(),
        },
      });
      return true;
    });
    return { duplicate: false, foundOrder: result };
  } catch (error) {
    if (!isUnique(error)) throw error;
    const receipt = await db.webhookReceipt.findUnique({
      where: { provider_topic_externalId: { provider: "SHOPIFY", topic: input.topic, externalId: input.webhookId } },
    });
    if (!receipt || receipt.payloadHash !== digest) {
      throw new RuntimeError(409, "webhook_id_conflict", "Webhook ID was reused with different data");
    }
    return { duplicate: true, foundOrder: true };
  }
}

function safeInviteProductFacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, 250).map((item) => Object.fromEntries(Object.entries({
    productGid: shopifyGid(
      "Product",
      item.productGid ?? item.product_id ?? item.productId ?? item.ProductID,
    ),
    variantGid: shopifyGid(
      "ProductVariant",
      item.variantGid ?? item.variant_id ?? item.variantId ?? item.VariantID,
    ),
    handle: optionalString(
      item.handle ?? item.product_handle ?? item.productHandle ?? item.Handle,
      255,
    )?.toLowerCase(),
    productKey: exactCoreProductKey(item.productKey, item.product_key, item.title),
    quantity: Math.max(0, Math.trunc(numberValue(item.quantity ?? item.Quantity) ?? 0)),
  }).filter(([, field]) => field !== undefined)));
}

export interface KlaviyoInviteResult {
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
  duplicate: boolean;
}

export function klaviyoInviteRequestDigest(input: {
  shopDomain: string;
  surveyVersionId: string;
  placementId: string;
  surface: Surface;
  profileId: string;
  profileEmailHash?: string;
  profilePhoneHash?: string;
  orderGidHash?: string;
  productFacts: unknown;
  locale: string;
  flowHash?: string;
  expiresInDays: number;
}): string {
  return payloadDigest({
    ...input,
    profileEmailHash: input.profileEmailHash ?? null,
    profilePhoneHash: input.profilePhoneHash ?? null,
    orderGidHash: input.orderGidHash ?? null,
    flowHash: input.flowHash ?? null,
  });
}

export async function createKlaviyoInvite(
  rawInput: unknown,
  flowId?: string,
): Promise<KlaviyoInviteResult> {
  if (!isRecord(rawInput)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  const shopDomain = optionalString(rawInput.shopDomain, 256)?.toLowerCase() ?? shopAliases()[0];
  if (!shopDomain || !configuredShopDomains().includes(shopDomain)) {
    throw new RuntimeError(403, "shop_not_allowed", "Shop is not configured for this app");
  }
  const profile = isRecord(rawInput.profile) ? rawInput.profile : {};
  const profileId = requiredString(rawInput.profileId ?? rawInput.profile_id ?? profile.id, "profile.id", 255);
  const profileEmail = optionalString(
    rawInput.email ?? profile.email ?? profile.$email,
    320,
  );
  const profilePhone = optionalString(
    rawInput.phone ?? rawInput.phone_number ?? profile.phone ?? profile.phone_number ?? profile.$phone_number,
    64,
  );
  const idempotencyInput = requiredString(rawInput.idempotencyKey ?? rawInput.idempotency_key, "idempotencyKey", 255);
  const idempotencyKey = hashIdentifier(`${shopDomain}:${flowId ?? "flow"}:${idempotencyInput}`, "klaviyo-invite");
  const surveyId = optionalString(rawInput.surveyId, 128);
  const surveySlug = optionalString(rawInput.surveySlug ?? rawInput.survey_slug, 128);
  if (!surveyId && !surveySlug) throw new RuntimeError(400, "survey_required", "surveyId or surveySlug is required");
  const survey = await db.survey.findFirst({
    where: {
      shopDomain: { in: [...shopAliases(shopDomain)] },
      status: SurveyStatus.PUBLISHED,
      activeVersionId: { not: null },
      shop: { active: true },
      ...(surveyId ? { id: surveyId } : { slug: surveySlug }),
    },
    include: { activeVersion: true },
  });
  if (!survey?.activeVersion) throw new RuntimeError(404, "survey_not_found", "Published survey was not found");
  const channel = String(rawInput.channel ?? rawInput.surface ?? "email").toLowerCase();
  const surface: Surface = channel.includes("sms") ? "KLAVIYO_SMS" : "KLAVIYO_EMAIL";
  const orderGid = normalizeOrderGid(rawInput.orderGid ?? rawInput.order_gid);
  if (!orderGid && !profileEmail && !profilePhone) {
    throw new RuntimeError(
      422,
      "profile_identity_required",
      "A profile email or phone is required when no order is attached",
    );
  }
  const orderFact = orderGid
    ? await db.orderFact.findFirst({ where: { orderGidHash: { in: shopAliases(shopDomain).map((domain) => orderIdentityHash(domain, orderGid)) } } })
    : null;
  const rawProductFacts = orderFact?.productFacts
    ?? safeInviteProductFacts(rawInput.productFacts ?? rawInput.products);
  const productFacts = await enrichProductFactsWithMappings(shopDomain, rawProductFacts);
  const now = new Date();
  const placement = await db.placement.findUnique({
    where: { surveyId_surface: { surveyId: survey.id, surface } },
    include: {
      audienceRules: { orderBy: [{ groupIndex: "asc" }, { sortOrder: "asc" }] },
      _count: {
        select: { responses: { where: { status: ResponseStatus.COMPLETED } } },
      },
    },
  });
  if (!placement
    || !placement.enabled
    || (placement.startsAt && placement.startsAt > now)
    || (placement.endsAt && placement.endsAt <= now)
    || (placement.maxResponses !== null && placement._count.responses >= placement.maxResponses)) {
    throw new RuntimeError(409, "placement_inactive", "Klaviyo placement is not active");
  }
  const audience = toAudienceContext(rawInput, surface, orderFact);
  if (!evaluateStoredAudience(placement.audienceRules, audience)) {
    throw new RuntimeError(422, "audience_not_eligible", "Profile does not match the survey audience");
  }
  const samplePercentage = Math.max(0, Math.min(100,
    placement.sampleRate <= 1 ? placement.sampleRate * 100 : placement.sampleRate));
  if (samplePercentage <= 0
    || (samplePercentage < 100 && stableSampleBucket(profileId, survey.id) >= samplePercentage)) {
    throw new RuntimeError(422, "sample_not_selected", "Profile is outside the survey sample");
  }
  if (placement.frequencyCapDays > 0) {
    const previousInvite = await db.invite.findFirst({
      where: {
        surface,
        klaviyoProfileId: profileId,
        idempotencyKey: { not: idempotencyKey },
        createdAt: { gte: new Date(now.getTime() - placement.frequencyCapDays * 86_400_000) },
        surveyVersion: { surveyId: survey.id },
      },
      select: { id: true },
    });
    if (previousInvite) {
      throw new RuntimeError(409, "frequency_capped", "Profile is inside the invitation frequency cap");
    }
  }
  if (survey.kind === "PURCHASE_MOTIVATION" && productFacts && coreProductsFromFacts(productFacts).length === 0) {
    throw new RuntimeError(422, "accessory_only_order", "Purchase motivation is not sent for accessory-only orders");
  }
  const expiresInDays = Math.max(1, Math.min(90, Math.trunc(numberValue(rawInput.expiresInDays ?? rawInput.expires_in_days) ?? 14)));
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  const token = deterministicOpaqueToken("klaviyo-invite", idempotencyKey);
  const tokenHash = hashInviteToken(token, process.env.SHOPOLL_TOKEN_PEPPER ?? "");
  const hash = orderFact?.orderGidHash ?? (orderGid ? orderIdentityHash(survey.shopDomain, orderGid) : undefined);
  const encrypted = orderGid ? encryptText(orderGid, `invite-order:${survey.shopDomain}:${hash}`) : undefined;
  const locale = optionalString(rawInput.locale, 32) ?? "en";
  const flowHash = flowId ? hashIdentifier(flowId, "klaviyo-flow") : undefined;
  const profileEmailHash = profileEmail
    ? contactIdentityHash(survey.shopDomain, "email", profileEmail)
    : undefined;
  const profilePhoneHash = profilePhone
    ? contactIdentityHash(survey.shopDomain, "phone", profilePhone)
    : undefined;
  const requestDigest = klaviyoInviteRequestDigest({
    shopDomain: survey.shopDomain,
    surveyVersionId: survey.activeVersion.id,
    placementId: placement.id,
    surface,
    profileId,
    profileEmailHash,
    profilePhoneHash,
    orderGidHash: hash,
    productFacts: productFacts ?? [],
    locale,
    flowHash,
    expiresInDays,
  });
  let duplicate = false;
  let invite;
  try {
    invite = await db.invite.create({
      data: {
        surveyVersionId: survey.activeVersion.id,
        placementId: placement.id,
        surface,
        tokenHash,
        orderGidHash: hash,
        orderGidEncrypted: encrypted,
        klaviyoProfileId: profileId,
        profileEmailHash,
        profilePhoneHash,
        productFacts: asJson(productFacts ?? []),
        context: asJson({
          locale,
          flowId: flowHash,
          requestDigest,
        }),
        idempotencyKey,
        expiresAt,
      },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    duplicate = true;
    invite = await db.invite.findUnique({ where: { idempotencyKey } });
    const existingContext = invite && isRecord(invite.context) ? invite.context : {};
    if (!invite
      || invite.surveyVersionId !== survey.activeVersion.id
      || invite.klaviyoProfileId !== profileId
      || existingContext.requestDigest !== requestDigest) {
      throw new RuntimeError(409, "idempotency_conflict", "Idempotency key was used for another invitation");
    }
  }
  const baseUrl = (process.env.SHOPOLL_PUBLIC_URL || process.env.SHOPIFY_APP_URL || "https://poll.harborinno.com").replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/s/${encodeURIComponent(token)}?lang=${encodeURIComponent(locale)}`;
  const eventKey = `klaviyo:survey-ready:${invite.id}`;
  await db.integrationEvent.upsert({
    where: { idempotencyKey: eventKey },
    create: {
      shopDomain: survey.shopDomain,
      provider: "KLAVIYO",
      eventType: "SURVEY_READY",
      idempotencyKey: eventKey,
      payload: asJson({ version: 1, inviteId: invite.id }),
    },
    update: {},
  });
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!apiKey) throw new RuntimeError(503, "klaviyo_not_configured", "Klaviyo is not configured");
  try {
    await new KlaviyoEventsClient({ apiKey }).sendSurveyReady({
      profile: { id: profileId },
      uniqueId: eventKey,
      surveyId: survey.id,
      surveyVersionId: survey.activeVersion.id,
      channel: "klaviyo",
      locale,
      orderGid,
      inviteUrl,
      inviteId: invite.id,
    });
    await db.integrationEvent.update({
      where: { idempotencyKey: eventKey },
      data: { status: "SENT", attempts: { increment: 1 }, processedAt: new Date(), errorCode: null },
    });
  } catch (error) {
    await db.integrationEvent.update({
      where: { idempotencyKey: eventKey },
      data: { status: "FAILED", attempts: { increment: 1 }, errorCode: error instanceof Error ? error.name.slice(0, 64) : "KLAVIYO_ERROR" },
    });
    throw new RuntimeError(502, "klaviyo_delivery_failed", "Klaviyo did not accept the Survey Ready event");
  }
  return { inviteId: invite.id, inviteUrl, expiresAt: invite.expiresAt.toISOString(), duplicate };
}

function privacyOrderGids(payload: Record<string, unknown>): string[] {
  const raw = Array.isArray(payload.orders_to_redact)
    ? payload.orders_to_redact
    : Array.isArray(payload.orders_requested) ? payload.orders_requested : [];
  return raw.map((value) => normalizeOrderGid(value)).filter((value): value is string => Boolean(value));
}

async function privacyReplay(topic: string, externalId: string, digest: string): Promise<boolean> {
  const receipt = await db.webhookReceipt.findUnique({
    where: { provider_topic_externalId: { provider: "SHOPIFY", topic, externalId } },
  });
  if (!receipt) return false;
  if (receipt.payloadHash !== digest) {
    throw new RuntimeError(409, "webhook_id_conflict", "Webhook ID was reused with different data");
  }
  return true;
}

function privacyIdentityHashes(shopDomain: string, payload: Record<string, unknown>) {
  const customer = isRecord(payload.customer) ? payload.customer : {};
  const email = optionalString(customer.email, 320);
  const phone = optionalString(customer.phone, 64);
  const aliases = shopAliases(shopDomain);
  return {
    emailHashes: email
      ? aliases.map((domain) => contactIdentityHash(domain, "email", email))
      : [],
    phoneHashes: phone
      ? aliases.map((domain) => contactIdentityHash(domain, "phone", phone))
      : [],
  };
}

function privacyCustomerHash(shopDomain: string, payload: Record<string, unknown>): string | undefined {
  const customer = isRecord(payload.customer) ? payload.customer : {};
  const customerId = optionalString(customer.id, 128);
  if (customerId) return hashIdentifier(`${shopDomain}:${customerId}`, "privacy-customer");
  const { emailHashes, phoneHashes } = privacyIdentityHashes(shopDomain, payload);
  const firstIdentity = emailHashes[0] ?? phoneHashes[0];
  return firstIdentity ? hashIdentifier(firstIdentity, "privacy-customer") : undefined;
}

function contactEncryptionKey(): Buffer {
  const configured = process.env.SHOPOLL_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SHOPOLL_ENCRYPTION_KEY must be configured in production");
  }
  return createHash("sha256")
    .update(configured || "shopoll-development-encryption-key")
    .digest();
}

function exportAnswer(answer: {
  responseSessionId: string;
  questionId: string;
  questionSnapshot: Prisma.JsonValue;
  value: Prisma.JsonValue | null;
  encryptedValue: string | null;
  answeredAt: Date;
}, shopDomain: string): Record<string, unknown> {
  let value: unknown = answer.value;
  if (answer.encryptedValue) {
    const stored = JSON.parse(answer.encryptedValue) as unknown;
    const fields = isRecord(stored) && isRecord(stored.fields) ? stored.fields : {};
    const decrypted: Record<string, unknown> = isRecord(answer.value) ? { ...answer.value } : {};
    for (const field of ["email", "phone"] as const) {
      const envelope = fields[field];
      if (!isRecord(envelope)) continue;
      decrypted[field] = decryptContactValue(
        envelope as unknown as EncryptedContactValueV1,
        contactEncryptionKey(),
        {
          shopId: shopDomain,
          responseSessionId: answer.responseSessionId,
          questionId: answer.questionId,
          fieldType: field,
        },
      );
    }
    value = decrypted;
  }
  return {
    questionId: answer.questionId,
    questionSnapshot: answer.questionSnapshot,
    value,
    answeredAt: answer.answeredAt.toISOString(),
  };
}

export async function processCustomerDataRequest(
  shopDomain: string,
  payload: unknown,
  webhookId = `CUSTOMERS_DATA_REQUEST:${payloadDigest(payload)}`,
): Promise<void> {
  if (!isRecord(payload)) return;
  assertConfiguredShopDomain(shopDomain);
  const digest = payloadDigest(payload);
  if (await privacyReplay("CUSTOMERS_DATA_REQUEST", webhookId, digest)) return;
  const orderGids = privacyOrderGids(payload);
  const orderHashes = orderGids.flatMap((gid) => shopAliases(shopDomain).map((domain) => orderIdentityHash(domain, gid)));
  const aliases = shopAliases(shopDomain);
  const { emailHashes, phoneHashes } = privacyIdentityHashes(shopDomain, payload);
  const identityFilters: Prisma.AnswerWhereInput[] = [];
  if (emailHashes.length) identityFilters.push({ emailIdentityHash: { in: emailHashes } });
  if (phoneHashes.length) identityFilters.push({ phoneIdentityHash: { in: phoneHashes } });
  const responseFilters: Prisma.ResponseSessionWhereInput[] = [];
  if (orderHashes.length) responseFilters.push({ orderGidHash: { in: orderHashes } });
  if (identityFilters.length) responseFilters.push({ answers: { some: { OR: identityFilters } } });
  if (emailHashes.length) responseFilters.push({ invite: { profileEmailHash: { in: emailHashes } } });
  if (phoneHashes.length) responseFilters.push({ invite: { profilePhoneHash: { in: phoneHashes } } });
  const inviteFilters: Prisma.InviteWhereInput[] = [];
  if (orderHashes.length) inviteFilters.push({ orderGidHash: { in: orderHashes } });
  if (emailHashes.length) inviteFilters.push({ profileEmailHash: { in: emailHashes } });
  if (phoneHashes.length) inviteFilters.push({ profilePhoneHash: { in: phoneHashes } });
  const [orders, responses, invites] = await Promise.all([
    orderHashes.length
      ? db.orderFact.findMany({
          where: { shopDomain: { in: [...aliases] }, orderGidHash: { in: orderHashes } },
          orderBy: { orderCreatedAt: "asc" },
        })
      : [],
    responseFilters.length
      ? db.responseSession.findMany({
          where: { shopDomain: { in: [...aliases] }, OR: responseFilters },
          include: {
            answers: { orderBy: { answeredAt: "asc" } },
            surveyVersion: { include: { survey: { select: { name: true, slug: true } } } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
    inviteFilters.length
      ? db.invite.findMany({
          where: {
            OR: inviteFilters,
            surveyVersion: { survey: { shopDomain: { in: [...aliases] } } },
          },
          select: { id: true, surface: true, createdAt: true, usedAt: true, expiresAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  const requestHash = hashIdentifier(webhookId, "privacy-request");
  const customerHash = privacyCustomerHash(shopDomain, payload);
  const exportPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    shopDomain,
    responses: responses.map((response) => ({
      id: response.id,
      survey: response.surveyVersion.survey.name,
      surveySlug: response.surveyVersion.survey.slug,
      surveyVersion: response.surveyVersion.version,
      surface: response.surface,
      locale: response.locale,
      status: response.status,
      createdAt: response.createdAt.toISOString(),
      completedAt: response.completedAt?.toISOString(),
      answers: response.answers.map((answer) => exportAnswer(answer, response.shopDomain)),
    })),
    orders: orders.map((order) => ({
      createdAt: order.orderCreatedAt.toISOString(),
      amount: order.amount.toString(),
      currency: order.currency,
      market: order.market,
      locale: order.locale,
      products: order.productFacts,
      source: order.source,
    })),
    invitations: invites.map((invite) => ({
      id: invite.id,
      surface: invite.surface,
      createdAt: invite.createdAt.toISOString(),
      usedAt: invite.usedAt?.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
    })),
  };
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  try {
    await db.$transaction([
      db.webhookReceipt.create({ data: { provider: "SHOPIFY", topic: "CUSTOMERS_DATA_REQUEST", externalId: webhookId, payloadHash: digest } }),
      db.privacyExport.create({
        data: {
          shopDomain,
          requestHash,
          customerHash,
          payloadEncrypted: encryptText(
            JSON.stringify(exportPayload),
            `privacy-export:${shopDomain}:${requestHash}`,
          ),
          expiresAt,
        },
      }),
      db.auditLog.create({
        data: {
          shopDomain,
          actorHash: customerHash,
          action: "CUSTOMER_DATA_REQUEST",
          resourceType: "privacy_request",
          resourceId: requestHash,
          changes: asJson({
            exportExpiresAt: expiresAt.toISOString(),
            matchedOrders: orders.length,
            matchedResponses: responses.length,
            matchedInvites: invites.length,
          }),
        },
      }),
    ]);
  } catch (error) {
    if (!isUnique(error) || !(await privacyReplay("CUSTOMERS_DATA_REQUEST", webhookId, digest))) throw error;
  }
}

export async function processCustomerRedact(
  shopDomain: string,
  payload: unknown,
  webhookId = `CUSTOMERS_REDACT:${payloadDigest(payload)}`,
): Promise<void> {
  if (!isRecord(payload)) return;
  assertConfiguredShopDomain(shopDomain);
  const digest = payloadDigest(payload);
  if (await privacyReplay("CUSTOMERS_REDACT", webhookId, digest)) return;
  const orderGids = privacyOrderGids(payload);
  const hashes = orderGids.flatMap((gid) => shopAliases(shopDomain).map((domain) => orderIdentityHash(domain, gid)));
  const aliases = shopAliases(shopDomain);
  const { emailHashes, phoneHashes } = privacyIdentityHashes(shopDomain, payload);
  const answerFilters: Prisma.AnswerWhereInput[] = [];
  if (emailHashes.length) answerFilters.push({ emailIdentityHash: { in: emailHashes } });
  if (phoneHashes.length) answerFilters.push({ phoneIdentityHash: { in: phoneHashes } });
  const responseFilters: Prisma.ResponseSessionWhereInput[] = [];
  if (hashes.length) responseFilters.push({ orderGidHash: { in: hashes } });
  if (answerFilters.length) responseFilters.push({ answers: { some: { OR: answerFilters } } });
  if (emailHashes.length) responseFilters.push({ invite: { profileEmailHash: { in: emailHashes } } });
  if (phoneHashes.length) responseFilters.push({ invite: { profilePhoneHash: { in: phoneHashes } } });
  const inviteFilters: Prisma.InviteWhereInput[] = [];
  if (hashes.length) inviteFilters.push({ orderGidHash: { in: hashes } });
  if (emailHashes.length) inviteFilters.push({ profileEmailHash: { in: emailHashes } });
  if (phoneHashes.length) inviteFilters.push({ profilePhoneHash: { in: phoneHashes } });
  const customerHash = privacyCustomerHash(shopDomain, payload);
  try {
    await db.$transaction([
      db.webhookReceipt.create({ data: { provider: "SHOPIFY", topic: "CUSTOMERS_REDACT", externalId: webhookId, payloadHash: digest } }),
      ...(responseFilters.length
        ? [db.responseSession.deleteMany({ where: { shopDomain: { in: [...aliases] }, OR: responseFilters } })]
        : []),
      ...(inviteFilters.length
        ? [db.invite.deleteMany({
            where: {
              OR: inviteFilters,
              surveyVersion: { survey: { shopDomain: { in: [...aliases] } } },
            },
          })]
        : []),
      ...(hashes.length
        ? [db.orderFact.deleteMany({ where: { shopDomain: { in: [...aliases] }, orderGidHash: { in: hashes } } })]
        : []),
      ...(customerHash
        ? [db.privacyExport.deleteMany({ where: { shopDomain: { in: [...aliases] }, customerHash } })]
        : []),
      db.auditLog.create({
        data: {
          shopDomain,
          action: "CUSTOMER_REDACTED",
          resourceType: "privacy_request",
          changes: asJson({
            orderReferencesMatched: hashes.length,
            emailIdentityMatched: emailHashes.length > 0,
            phoneIdentityMatched: phoneHashes.length > 0,
          }),
        },
      }),
    ]);
  } catch (error) {
    if (!isUnique(error) || !(await privacyReplay("CUSTOMERS_REDACT", webhookId, digest))) throw error;
  }
}

export async function processShopRedact(
  shopDomain: string,
  webhookId = `SHOP_REDACT:${hashIdentifier(shopDomain, "shop-redact")}`,
): Promise<void> {
  assertConfiguredShopDomain(shopDomain);
  const digest = payloadDigest({ shopDomain });
  if (await privacyReplay("SHOP_REDACT", webhookId, digest)) return;
  const aliases = shopAliases(shopDomain);
  try {
    await db.$transaction(async (tx) => {
      await tx.webhookReceipt.create({ data: { provider: "SHOPIFY", topic: "SHOP_REDACT", externalId: webhookId, payloadHash: digest } });
      await tx.pixelEvent.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.orderFact.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.integrationEvent.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.integrationConfig.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.privacyExport.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.auditLog.deleteMany({ where: { shopDomain: { in: [...aliases] } } });
      await tx.session.deleteMany({ where: { shop: { in: [...aliases] } } });
      await tx.shop.deleteMany({ where: { domain: { in: [...aliases] } } });
    });
  } catch (error) {
    if (!isUnique(error) || !(await privacyReplay("SHOP_REDACT", webhookId, digest))) throw error;
  }
}

