import db from "../app/db.server";
import { HARBOR_SURVEY_TEMPLATES } from "../app/data";
import { provisionHarborShop } from "../app/services/provision-shop.server";
import { canonicalShopDomain } from "../app/services/shop-domain.server";

const shopDomain = canonicalShopDomain(
  process.env.SHOPIFY_SHOP_DOMAIN || "shop.harborinno.com",
);

provisionHarborShop(shopDomain)
  .then(() => {
    console.log(`Seeded ${HARBOR_SURVEY_TEMPLATES.length} Shopoll drafts for ${shopDomain}`);
  })
  .finally(async () => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
