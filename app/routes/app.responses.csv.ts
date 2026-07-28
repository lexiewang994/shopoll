import type { LoaderFunctionArgs } from "react-router";

import type { AnalyticsFilter } from "../domain";
import { responseCsv } from "../services/admin-analytics.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const url = new URL(request.url);
  const filter: AnalyticsFilter = {
    schemaVersion: 1,
    surveyId: url.searchParams.get("surveyId") || undefined,
    productGid: url.searchParams.get("productGid") || undefined,
    variantGid: url.searchParams.get("variantGid") || undefined,
    market: url.searchParams.get("market") || undefined,
    locale: url.searchParams.get("locale") || undefined,
    source: url.searchParams.get("source") || undefined,
    utmSource: url.searchParams.get("utmSource") || undefined,
    utmMedium: url.searchParams.get("utmMedium") || undefined,
    utmCampaign: url.searchParams.get("utmCampaign") || undefined,
    customerType:
      url.searchParams.get("customerType") === "new" ||
      url.searchParams.get("customerType") === "returning"
        ? (url.searchParams.get("customerType") as "new" | "returning")
        : undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
  };
  const csv = await responseCsv(shopDomain, filter);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="shopoll-responses-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
};
