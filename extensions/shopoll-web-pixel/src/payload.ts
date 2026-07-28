export const SUPPORTED_EVENTS = [
  "page_viewed",
  "product_viewed",
  "product_added_to_cart",
  "checkout_started",
  "checkout_completed",
] as const;

export type SupportedEventName = (typeof SUPPORTED_EVENTS)[number];

interface LocationLike {
  pathname?: string;
  search?: string;
}

export interface PixelEventLike {
  id?: string;
  name?: string;
  clientId?: string;
  seq?: number;
  timestamp?: string;
  context?: {
    document?: {location?: LocationLike};
    window?: {location?: LocationLike; innerWidth?: number};
    navigator?: {language?: string | null};
  };
  data?: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function opaqueHash(value: string): string {
  let first = 2166136261;
  let second = 2246822507;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489909);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function pseudonymousId(clientId: string | undefined, shopDomain: string): string | undefined {
  if (!clientId) return undefined;
  return `v1_${opaqueHash(`${shopDomain}:${clientId}`)}`;
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value);
  return result.length <= 160 ? result : undefined;
}

function cleanMoney(value: unknown): {amount: number; currencyCode?: string} | undefined {
  const money = record(value);
  if (!money) return undefined;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return undefined;
  const currencyCode =
    typeof money.currencyCode === "string" && /^[A-Z]{3}$/.test(money.currencyCode)
      ? money.currencyCode
      : undefined;
  return {amount, currencyCode};
}

export function fixedUtm(search: string | undefined): Record<string, string> | undefined {
  if (!search) return undefined;
  const allowed = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
  const result: Record<string, string> = {};
  for (const pair of search.replace(/^\?/, "").split("&")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    try {
      const key = decodeURIComponent(pair.slice(0, separator).replace(/\+/g, " "));
      if (!allowed.has(key)) continue;
      const value = decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, " ")).slice(0, 200);
      if (value) result[key] = value;
    } catch {
      // Ignore malformed query parameters rather than forwarding raw input.
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function lineSummary(value: unknown): Record<string, unknown> | undefined {
  const line = record(value);
  if (!line) return undefined;
  const variant = record(line.variant) ?? record(line.merchandise) ?? record(line.productVariant);
  const product = record(variant?.product) ?? record(line.product);
  const cost = record(line.cost);
  const summary = {
    productGid: cleanId(product?.id),
    variantGid: cleanId(variant?.id),
    quantity: Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : undefined,
    lineTotal: cleanMoney(line.finalLinePrice ?? cost?.totalAmount ?? line.linePrice),
  };
  return summary.productGid || summary.variantGid ? summary : undefined;
}

function commerceData(event: PixelEventLike): Record<string, unknown> | undefined {
  const data = record(event.data) ?? {};
  if (event.name === "product_viewed") {
    const topProduct = record(data.product);
    const variant = record(data.productVariant) ?? record(topProduct?.selectedVariant);
    const product = record(variant?.product) ?? topProduct;
    return {
      productGid: cleanId(product?.id),
      variantGid: cleanId(variant?.id),
      price: cleanMoney(variant?.price),
    };
  }
  if (event.name === "product_added_to_cart") {
    return lineSummary(data.cartLine);
  }
  if (event.name === "checkout_started" || event.name === "checkout_completed") {
    const checkout = record(data.checkout) ?? {};
    const rawLines = Array.isArray(checkout.lineItems)
      ? checkout.lineItems
      : Array.isArray(checkout.lines)
        ? checkout.lines
        : [];
    const lines = rawLines
      .map(lineSummary)
      .filter(Boolean)
      .slice(0, 100);
    return {
      orderGid: cleanId(record(checkout.order)?.id),
      total: cleanMoney(checkout.totalPrice),
      subtotal: cleanMoney(checkout.subtotalPrice),
      lineItems: lines,
    };
  }
  return undefined;
}

export function buildPayload(
  event: PixelEventLike,
  shopDomain: string,
  visitorToken?: string,
) {
  const location = event.context?.document?.location ?? event.context?.window?.location;
  const width = Number(event.context?.window?.innerWidth);
  return {
    schemaVersion: 1 as const,
    event: {
      id: cleanId(event.id),
      name: SUPPORTED_EVENTS.includes(event.name as SupportedEventName)
        ? (event.name as SupportedEventName)
        : undefined,
      pseudonymousId: visitorToken || pseudonymousId(event.clientId, shopDomain),
      sequence: Number.isFinite(Number(event.seq)) ? Number(event.seq) : undefined,
      occurredAt: typeof event.timestamp === "string" ? event.timestamp : undefined,
      shopDomain: cleanId(shopDomain),
      page: {
        path:
          typeof location?.pathname === "string" && location.pathname.startsWith("/")
            ? location.pathname.slice(0, 500)
            : undefined,
        locale: event.context?.navigator?.language?.slice(0, 35) || undefined,
        device: Number.isFinite(width)
          ? width < 750
            ? "mobile"
            : width < 1024
              ? "tablet"
              : "desktop"
          : undefined,
        utm: fixedUtm(location?.search),
      },
      commerce: commerceData(event),
    },
  };
}

export function resolvePixelEndpoint(configuredUrl: unknown, compiledAppUrl = ""): string {
  const configured = String(configuredUrl ?? "").trim();
  const raw = String(configured || compiledAppUrl).trim().replace(/\/$/, "");
  if (!raw) return "";
  // Web pixels run in a strict sandbox where URL is not part of the guaranteed API.
  const match = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i.exec(raw);
  if (!match || match[2].includes("@")) return "";
  const protocol = match[1].toLowerCase();
  const authority = match[2];
  if (
    protocol !== "https" &&
    !/^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(authority)
  ) {
    return "";
  }
  let path = (match[3] ?? "").replace(/\/$/, "");
  if (path.endsWith("/api/public/pixel/events")) return `${protocol}://${authority}${path}`;
  if (path.endsWith("/api/public")) path += "/pixel/events";
  else path += "/api/public/pixel/events";
  return `${protocol}://${authority}${path}`;
}

export function resolvePixelProxyEndpoint(configuredUrl: unknown, shopDomain: string): string {
  const normalizedShop = shopDomain.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]+\.myshopify\.com$/.test(normalizedShop)) return "";
  const base = String(configuredUrl ?? "").trim() || `https://${normalizedShop}/apps/shopoll`;
  const endpoint = `${base.replace(/\/$/, "").replace(/\/api\/public$/i, "")}/pixel/events`;
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)$/i.exec(endpoint);
  if (!match || match[1].toLowerCase() !== normalizedShop) return "";
  return match[2] === "/apps/shopoll/pixel/events" ? endpoint : "";
}
