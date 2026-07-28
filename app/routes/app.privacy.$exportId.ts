import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { shopAliases } from "../services/runtime/common.server";
import { decryptText } from "../services/security.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const privacyExport = await db.privacyExport.findFirst({
    where: {
      id: String(params.exportId),
      shopDomain: { in: [...shopAliases(shopDomain)] },
    },
  });
  if (!privacyExport) throw new Response("Privacy export not found", { status: 404 });
  if (privacyExport.expiresAt <= new Date()) {
    throw new Response("Privacy export has expired", { status: 410 });
  }
  const payload = decryptText(
    privacyExport.payloadEncrypted,
    `privacy-export:${privacyExport.shopDomain}:${privacyExport.requestHash}`,
  );
  return new Response(payload, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="shopoll-privacy-${privacyExport.id}.json"`,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
};
