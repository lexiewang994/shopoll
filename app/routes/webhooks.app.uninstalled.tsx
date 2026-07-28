import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { uninstallDeletionAt } from "../services/integrations";
import { logger } from "../services/logger.server";
import { canonicalShopDomain } from "../services/shop-domain.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logger.info({ topic, shop }, "Shopify app uninstalled");

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  const uninstalledAt = new Date();
  const shopDomain = canonicalShopDomain(shop);
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.shop.updateMany({
      where: { domain: shopDomain },
      data: {
        active: false,
        uninstalledAt,
        purgeAfter: uninstallDeletionAt(uninstalledAt),
      },
    }),
  ]);

  return new Response();
};
