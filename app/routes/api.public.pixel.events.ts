import type { ActionFunctionArgs } from "react-router";
import { handlePublicAction } from "../services/runtime/http.server";
import { recordPixelEvents } from "../services/runtime/public-surveys.server";
import {
  RuntimeError,
  configuredShopDomains,
  isRecord,
  optionalString,
} from "../services/runtime/common.server";

function normalizedPixelBody(body: Record<string, unknown>) {
  const event = isRecord(body.event) ? body.event : null;
  if (!event) return body;
  const shopDomain = optionalString(event.shopDomain, 255)?.toLowerCase();
  if (!shopDomain || !configuredShopDomains().includes(shopDomain)) {
    throw new RuntimeError(403, "shop_not_allowed", "Pixel shop is not configured");
  }
  const page = isRecord(event.page) ? event.page : {};
  const commerce = isRecord(event.commerce) ? event.commerce : {};
  const total = isRecord(commerce.total) ? commerce.total : {};
  const price = isRecord(commerce.price) ? commerce.price : {};
  const utm = isRecord(page.utm) ? page.utm : {};
  return {
    schemaVersion: 1,
    analyticsAllowed: true,
    visitorToken: event.pseudonymousId ?? event.id,
    event: {
      id: event.id,
      type: event.name,
      occurredAt: event.occurredAt,
      payload: {
        path: page.path,
        locale: page.locale,
        productGid: commerce.productGid,
        variantGid: commerce.variantGid,
        quantity: commerce.quantity,
        amount: total.amount ?? price.amount,
        currency: total.currencyCode ?? price.currencyCode,
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
      },
    },
    shopDomain,
  };
}

export const action = ({ request }: ActionFunctionArgs) =>
  handlePublicAction(request, async (body, identity) => {
    const normalized = normalizedPixelBody(body);
    if (identity.mode !== "proxy") {
      throw new RuntimeError(401, "signed_proxy_required", "Pixel events require a signed App Proxy request");
    }
    return recordPixelEvents(normalized, identity);
  });
