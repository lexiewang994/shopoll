import { createHash, createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AudienceContext, SurveyDefinitionV1, SurveyLocale } from "../../domain";
import { localizeText, resolveSurveyLocale } from "../../domain";
import { hashIdentifier } from "../security.server";

export interface PublicIdentity {
  shopDomain?: string;
  customerGid?: string;
  mode: "checkout" | "proxy" | "standalone" | "demo";
}

export class RuntimeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "RuntimeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeError(400, "invalid_request", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new RuntimeError(400, "invalid_request", `${label} is too long`);
  }
  return normalized;
}

export function optionalString(value: unknown, maximum = 512): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value.trim().slice(0, maximum);
}

export function safeAttributionValue(value: unknown, maximum = 200): string | undefined {
  const normalized = optionalString(value, maximum)
    ?.split("")
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("");
  if (!normalized || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(normalized)) return undefined;
  return normalized;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function payloadDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function configuredShopDomains(): readonly string[] {
  const allowed = process.env.SHOPIFY_SHOP_DOMAIN?.trim().toLowerCase();
  if (!allowed && process.env.NODE_ENV === "production") {
    throw new Error("SHOPIFY_SHOP_DOMAIN must be configured in production");
  }
  return [
    process.env.SHOP_CUSTOM_DOMAIN,
    allowed,
    process.env.SHOP_DOMAIN,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

export function assertConfiguredShopDomain(shopDomain: string): void {
  const normalized = shopDomain.toLowerCase();
  const allowed = process.env.SHOPIFY_SHOP_DOMAIN?.trim().toLowerCase();
  const custom = process.env.SHOP_CUSTOM_DOMAIN?.trim().toLowerCase();
  if (!allowed && process.env.NODE_ENV === "production") {
    throw new Error("SHOPIFY_SHOP_DOMAIN must be configured in production");
  }
  if (allowed && normalized !== allowed && normalized !== custom) {
    throw new RuntimeError(403, "shop_not_allowed", "This private app is not available for this shop");
  }
}

export function shopAliases(identityDomain?: string): readonly string[] {
  return [...new Set([
    identityDomain?.toLowerCase(),
    ...configuredShopDomains(),
  ].filter((value): value is string => Boolean(value)))];
}

export function assertIdentityCanAccessShop(
  identity: PublicIdentity,
  shopDomain: string,
): void {
  if (identity.mode === "standalone") {
    throw new RuntimeError(401, "resume_token_required", "A valid survey token is required");
  }
  if (identity.shopDomain) assertConfiguredShopDomain(identity.shopDomain);
  if (!shopAliases(identity.shopDomain).includes(shopDomain.toLowerCase())) {
    throw new RuntimeError(403, "shop_mismatch", "The request does not belong to this shop");
  }
}

export function deterministicOpaqueToken(namespace: string, value: string): string {
  const secret = process.env.SHOPOLL_TOKEN_PEPPER;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SHOPOLL_TOKEN_PEPPER must be configured in production");
  }
  return createHmac("sha256", secret || "shopoll-development-token-pepper")
    .update(`${namespace}:v1:${value}`)
    .digest("base64url");
}

export function normalizeOrderGid(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return `gid://shopify/Order/${value}`;
  }
  const normalized = optionalString(value, 256);
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) return `gid://shopify/Order/${normalized}`;
  if (/^gid:\/\/shopify\/Order\/\d+$/.test(normalized)) return normalized;
  throw new RuntimeError(400, "invalid_order", "orderGid is not a Shopify order GID");
}

export function orderIdentityHash(shopDomain: string, orderGid: string): string {
  return hashIdentifier(`${shopDomain.toLowerCase()}:${orderGid}`, "shopify-order");
}

export function surfaceFromContext(
  value: unknown,
  mode?: unknown,
): "THANK_YOU" | "ORDER_STATUS" | "THEME_INLINE" | "THEME_POPUP" | "STANDALONE" | "KLAVIYO_EMAIL" | "KLAVIYO_SMS" {
  const surface = String(value ?? "").toLowerCase();
  if (surface === "thank_you") return "THANK_YOU";
  if (surface === "order_status") return "ORDER_STATUS";
  if (surface === "theme_inline") return "THEME_INLINE";
  if (surface === "theme_popup") return "THEME_POPUP";
  if (surface === "theme") return String(mode ?? "").toLowerCase() === "inline" ? "THEME_INLINE" : "THEME_POPUP";
  if (surface === "standalone") return "STANDALONE";
  if (surface === "klaviyo_sms") return "KLAVIYO_SMS";
  if (surface === "klaviyo" || surface === "klaviyo_email") return "KLAVIYO_EMAIL";
  throw new RuntimeError(400, "invalid_surface", "Unsupported survey surface");
}

export function audienceSurface(surface: string): AudienceContext["surface"] {
  switch (surface) {
    case "THANK_YOU": return "thank_you";
    case "ORDER_STATUS": return "order_status";
    case "THEME_INLINE": return "theme_inline";
    case "THEME_POPUP": return "theme_popup";
    case "STANDALONE": return "standalone";
    default: return "klaviyo";
  }
}

function stringArray(value: unknown, maximum = 100): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maximum)
    .map((item) => item.slice(0, 256));
}

export function toAudienceContext(
  raw: Record<string, unknown>,
  surface: string,
  orderFact?: {
    amount?: unknown;
    market?: string | null;
    locale?: string | null;
    customerOrderIndex?: number | null;
    isFirstOrder?: boolean | null;
    productFacts?: unknown;
    source?: string | null;
    utm?: unknown;
    discountCodes?: unknown;
  } | null,
): AudienceContext {
  const page = isRecord(raw.page) ? raw.page : {};
  const utm = isRecord(orderFact?.utm) ? orderFact.utm : isRecord(raw.utm) ? raw.utm : {};
  const productFacts = Array.isArray(orderFact?.productFacts)
    ? orderFact.productFacts.filter(isRecord)
    : isRecord(orderFact?.productFacts) && Array.isArray(orderFact.productFacts.items)
      ? orderFact.productFacts.items.filter(isRecord)
      : [];
  const orderAmount = orderFact?.amount === undefined ? undefined : Number(orderFact.amount);
  const purchaseCount = orderFact?.customerOrderIndex ?? undefined;
  const customerType = orderFact?.isFirstOrder === undefined || orderFact?.isFirstOrder === null
    ? undefined
    : orderFact.isFirstOrder ? "new" as const : "returning" as const;
  const analyticsConsent = raw.analyticsAllowed === true || raw.analyticsConsent === true;
  const behaviorAttributionAllowed = !surface.startsWith("THEME_") || analyticsConsent;

  return {
    surface: audienceSurface(surface),
    placementKey: optionalString(raw.placementKey, 128),
    pageType: optionalString(page.type ?? raw.pageType, 64),
    path: optionalString(page.path ?? raw.path, 1024),
    productId: optionalString(page.productGid ?? raw.productId, 256),
    variantId: optionalString(page.variantGid ?? raw.variantId, 256),
    collectionIds: stringArray(raw.collectionIds),
    cartProductIds: behaviorAttributionAllowed ? stringArray(raw.cartProductIds) : undefined,
    orderProductIds: productFacts.map((item) => optionalString(item.productGid, 256)).filter((item): item is string => Boolean(item)),
    orderVariantIds: productFacts.map((item) => optionalString(item.variantGid, 256)).filter((item): item is string => Boolean(item)),
    orderAmount: Number.isFinite(orderAmount) ? orderAmount : undefined,
    market: optionalString(orderFact?.market ?? raw.market, 64),
    locale: optionalString(orderFact?.locale ?? raw.locale, 32),
    customerType,
    discountCodes: stringArray(orderFact?.discountCodes ?? raw.discountCodes),
    source: behaviorAttributionAllowed ? safeAttributionValue(orderFact?.source ?? raw.source, 256) : undefined,
    utmSource: behaviorAttributionAllowed ? safeAttributionValue(utm.utm_source ?? utm.source, 200) : undefined,
    utmMedium: behaviorAttributionAllowed ? safeAttributionValue(utm.utm_medium ?? utm.medium, 200) : undefined,
    utmCampaign: behaviorAttributionAllowed ? safeAttributionValue(utm.utm_campaign ?? utm.campaign, 200) : undefined,
    purchaseCount,
    device: ["desktop", "mobile", "tablet"].includes(String(raw.device))
      ? raw.device as AudienceContext["device"]
      : undefined,
    country: optionalString(raw.country, 8),
    elapsedSeconds: typeof raw.elapsedSeconds === "number" ? raw.elapsedSeconds : undefined,
    scrollPercent: typeof raw.scrollPercent === "number" ? raw.scrollPercent : undefined,
    event: optionalString(raw.event, 64),
    analyticsConsent,
  };
}

/** Only data approved for targeting/analytics crosses the persistence boundary. */
export function sanitizedPublicContext(
  raw: Record<string, unknown>,
  surface: string,
  orderFact?: Parameters<typeof toAudienceContext>[2],
): Record<string, unknown> {
  const audience = toAudienceContext(raw, surface, orderFact);
  const currentPage: Record<string, unknown> = {
    surface: audience.surface,
    placementKey: audience.placementKey,
    pageType: audience.pageType,
    path: audience.path,
    productId: audience.productId,
    variantId: audience.variantId,
    market: audience.market,
    locale: audience.locale,
    device: audience.device,
    country: audience.country,
    elapsedSeconds: audience.elapsedSeconds,
    scrollPercent: audience.scrollPercent,
    event: audience.event,
    analyticsConsent: audience.analyticsConsent === true,
  };
  if (audience.analyticsConsent) {
    Object.assign(currentPage, {
      collectionIds: audience.collectionIds,
      cartProductIds: audience.cartProductIds,
      source: audience.source,
      utmSource: audience.utmSource,
      utmMedium: audience.utmMedium,
      utmCampaign: audience.utmCampaign,
    });
  }
  return Object.fromEntries(Object.entries(currentPage).filter(([, value]) => value !== undefined));
}

export function parseDefinition(value: unknown): SurveyDefinitionV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.questions)) {
    throw new RuntimeError(500, "invalid_published_version", "Published survey data is invalid");
  }
  return value as unknown as SurveyDefinitionV1;
}

export interface CoreProductFact {
  key: "paper7" | "bricbloc" | "nexus";
  productGid?: string;
}

export function coreProductsFromFacts(value: unknown): CoreProductFact[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items) ? value.items : [];
  const found = new Map<CoreProductFact["key"], CoreProductFact>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const productKey = optionalString(row.productKey, 64)?.toLowerCase().replace(/[\s_-]+/g, " ");
    const handle = optionalString(row.handle, 255)?.toLowerCase();
    const title = optionalString(row.title, 255)?.toLowerCase().replace(/[\s_-]+/g, " ");
    const key = productKey === "paper7" || productKey === "paper 7"
      || handle === "paper-7-8gb-256gb-color-7-8-rlcd-tablet-with-android-14"
      || title === "paper7" || title === "paper 7"
      ? "paper7"
      : productKey === "bricbloc" || productKey === "bric bloc"
        || handle === "bricbloc-3-in-1-modular-gan-charger-with-ssd-hub"
        || title === "bricbloc" || title === "bric bloc"
        ? "bricbloc"
        : productKey === "nexus" || productKey === "nexus ai station"
          || handle === "nexus-ai-station"
          || title === "nexus" || title === "nexus ai station"
          ? "nexus"
          : undefined;
    if (key && !found.has(key)) {
      found.set(key, { key, productGid: optionalString(row.productGid, 256) });
    }
  }
  return [...found.values()];
}

export function publicSurveyDefinition(
  definition: SurveyDefinitionV1,
  requestedLocale: string | undefined,
  options: { autoCoreProduct?: CoreProductFact["key"] } = {},
): Record<string, unknown> {
  const locale = resolveSurveyLocale(requestedLocale, definition.enabledLocales, definition.defaultLocale);
  const autoCore = options.autoCoreProduct;
  const questions = definition.questions.filter((question) => {
    if (!autoCore) return true;
    if (question.id === "core_product") return false;
    if (question.id.endsWith("_reason") && question.id !== `${autoCore}_reason`) return false;
    return true;
  });
  const converted = questions.map((question) => {
    const navigation = (definition.navigation ?? []).filter((rule) => rule.fromQuestionId === question.id);
    return {
      id: question.id,
      type: question.kind === "star_rating" ? "rating" : question.kind,
      title: localizeText(question.title, locale, definition.enabledLocales, definition.defaultLocale),
      description: question.description
        ? localizeText(question.description, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      required: question.required === true,
      options: "options" in question
        ? question.options.map((option) => ({
          id: option.id,
          label: localizeText(option.label, locale, definition.enabledLocales, definition.defaultLocale),
        }))
        : undefined,
      maxLength: "maxLength" in question ? question.maxLength : undefined,
      placeholder: (question.kind === "short_text" || question.kind === "long_text") && question.placeholder
        ? localizeText(question.placeholder, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      scale: question.kind === "csat" ? question.scale : undefined,
      stars: question.kind === "star_rating" ? question.stars : undefined,
      lowLabel: (question.kind === "nps" || question.kind === "csat") && question.lowLabel
        ? localizeText(question.lowLabel, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      highLabel: (question.kind === "nps" || question.kind === "csat") && question.highLabel
        ? localizeText(question.highLabel, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      consentText: question.kind === "contact"
        ? localizeText(question.consentText, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      contactKind: question.kind === "contact" ? question.collect[0] : undefined,
      collect: question.kind === "contact" ? question.collect : undefined,
      buttonLabel: (question.kind === "welcome" || question.kind === "end") && question.buttonLabel
        ? localizeText(question.buttonLabel, locale, definition.enabledLocales, definition.defaultLocale)
        : undefined,
      visibleWhen: question.visibleWhen,
      logic: navigation.map((rule) => ({
        when: rule.when,
        action: rule.action.type,
        targetQuestionId: rule.action.type === "go_to" ? rule.action.questionId : undefined,
      })),
    };
  });
  const end = definition.questions.find((question) => question.kind === "end");
  const completionTitle = end
    ? localizeText(end.title, locale, definition.enabledLocales, definition.defaultLocale)
    : "Thank you";
  const completionMessage = end?.description
    ? localizeText(end.description, locale, definition.enabledLocales, definition.defaultLocale)
    : undefined;
  const accent = typeof definition.metadata?.accentColor === "string"
    && /^#[0-9a-f]{6}$/i.test(definition.metadata.accentColor)
    ? definition.metadata.accentColor
    : "#167b5b";
  const radiusValue = Number(definition.metadata?.borderRadius ?? 4);
  return {
    schemaVersion: 1,
    surveyId: definition.id,
    title: localizeText(definition.title, locale, definition.enabledLocales, definition.defaultLocale),
    description: definition.description
      ? localizeText(definition.description, locale, definition.enabledLocales, definition.defaultLocale)
      : undefined,
    startQuestionId: converted[0]?.id,
    questions: converted,
    completion: { title: completionTitle, message: completionMessage },
    style: {
      accentColor: accent,
      borderRadius: Number.isFinite(radiusValue) ? Math.max(0, Math.min(8, radiusValue)) : 4,
      density: definition.metadata?.density === "compact" ? "compact" : "comfortable",
      showBrand: definition.metadata?.showBrand !== false,
    },
    locale,
  };
}

export function resolvedLocale(definition: SurveyDefinitionV1, locale?: string): SurveyLocale {
  return resolveSurveyLocale(locale, definition.enabledLocales, definition.defaultLocale);
}
