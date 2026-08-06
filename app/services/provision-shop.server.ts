import { createHash } from "node:crypto";
import prismaClientPackage, {
  type Prisma,
  type Surface,
  type SurveyKind,
} from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const { Surface: SurfaceValue, SurveyKind: SurveyKindValue } = prismaClientPackage;

import { HARBOR_SURVEY_TEMPLATES } from "../data";
import db from "../db.server";

const kinds: Record<string, SurveyKind> = {
  purchase_motivation: SurveyKindValue.PURCHASE_MOTIVATION,
  purchase_barrier: SurveyKindValue.PURCHASE_BARRIER,
  cart_exit: SurveyKindValue.ABANDONMENT,
  abandoned_cart: SurveyKindValue.ABANDONMENT,
  post_delivery_nps: SurveyKindValue.NPS,
  product_satisfaction: SurveyKindValue.PRODUCT_FEEDBACK,
  standalone: SurveyKindValue.CUSTOM,
};

const surfaces: Record<string, Surface> = {
  purchase_motivation: SurfaceValue.THANK_YOU,
  purchase_barrier: SurfaceValue.THEME_POPUP,
  cart_exit: SurfaceValue.THEME_POPUP,
  abandoned_cart: SurfaceValue.KLAVIYO_EMAIL,
  post_delivery_nps: SurfaceValue.KLAVIYO_EMAIL,
  product_satisfaction: SurfaceValue.KLAVIYO_EMAIL,
  standalone: SurfaceValue.STANDALONE,
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const HARBOR_CORE_PRODUCTS = [
  {
    productKey: "paper7",
    title: "Paper7",
    handle: "paper-7-8gb-256gb-color-7-8-rlcd-tablet-with-android-14",
    productGid: "gid://shopify/Product/10143701631270",
  },
  {
    productKey: "bricbloc",
    title: "Bricbloc",
    handle: "bricbloc-3-in-1-modular-gan-charger-with-ssd-hub",
    productGid: "gid://shopify/Product/10235779088678",
  },
  {
    productKey: "nexus",
    title: "Nexus",
    handle: "nexus-ai-station",
    productGid: "gid://shopify/Product/10354179604774",
  },
] as const;

interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
}

interface ProductMappingIdentity {
  productKey: string;
  productGid: string | null;
  handle: string | null;
}

export interface HarborCoreProductMatch extends ShopifyProductNode {
  productKey: (typeof HARBOR_CORE_PRODUCTS)[number]["productKey"];
}

export function matchHarborCoreProducts(
  products: readonly ShopifyProductNode[],
  storedMappings: readonly ProductMappingIdentity[] = [],
): HarborCoreProductMatch[] {
  return HARBOR_CORE_PRODUCTS.flatMap((configured) => {
    const stored = storedMappings.find((mapping) => mapping.productKey === configured.productKey);
    const product = products.find((candidate) =>
      candidate.id === stored?.productGid
      || candidate.handle === stored?.handle
      || candidate.id === configured.productGid
      || candidate.handle === configured.handle,
    );
    return product ? [{ productKey: configured.productKey, ...product }] : [];
  });
}

export async function syncHarborProductMappings(
  shopDomain: string,
  admin: AdminApiContext,
): Promise<number> {
  const [response, storedMappings] = await Promise.all([
    admin.graphql(
      `#graphql
        query ShopollCoreProducts {
          products(first: 250) {
            nodes {
              id
              handle
              title
            }
          }
        }
      `,
    ),
    db.productMapping.findMany({
      where: {
        shopDomain,
        productKey: { in: HARBOR_CORE_PRODUCTS.map((product) => product.productKey) },
      },
      select: { productKey: true, productGid: true, handle: true },
    }),
  ]);
  const payload = await response.json() as {
    data?: { products?: { nodes?: unknown } };
    errors?: unknown[];
  };
  if (payload.errors?.length) {
    throw new Error("Shopify product synchronization returned GraphQL errors");
  }
  const nodes = Array.isArray(payload.data?.products?.nodes)
    ? payload.data.products.nodes.filter((node): node is ShopifyProductNode => {
        if (!node || typeof node !== "object") return false;
        const candidate = node as Record<string, unknown>;
        return typeof candidate.id === "string"
          && typeof candidate.handle === "string"
          && typeof candidate.title === "string";
      })
    : [];
  const matches = matchHarborCoreProducts(nodes, storedMappings);
  await Promise.all(matches.map((product) => db.productMapping.update({
    where: {
      shopDomain_productKey: { shopDomain, productKey: product.productKey },
    },
    data: {
      productGid: product.id,
      handle: product.handle,
      title: product.title,
      isCore: true,
    },
  })));
  return matches.length;
}

export async function provisionHarborShop(shopDomain: string): Promise<void> {
  await db.shop.upsert({
    where: { domain: shopDomain },
    create: { domain: shopDomain },
    update: { active: true, uninstalledAt: null, purgeAfter: null },
  });
  for (const product of HARBOR_CORE_PRODUCTS) {
    await db.productMapping.upsert({
      where: { shopDomain_productKey: { shopDomain, productKey: product.productKey } },
      create: { shopDomain, isCore: true, ...product },
      update: {
        title: product.title,
        productGid: product.productGid,
        handle: product.handle,
        isCore: true,
      },
    });
  }
  for (const surveyDefinition of HARBOR_SURVEY_TEMPLATES) {
    const survey = await db.survey.upsert({
      where: { shopDomain_slug: { shopDomain, slug: surveyDefinition.slug } },
      create: {
        shopDomain,
        slug: surveyDefinition.slug,
        name: surveyDefinition.internalName,
        description: surveyDefinition.description?.en,
        kind: kinds[surveyDefinition.category] ?? SurveyKindValue.CUSTOM,
        enabledLocales: [...surveyDefinition.enabledLocales],
        draftDefinition: json(surveyDefinition),
        priority: surveyDefinition.category === "purchase_motivation" ? 100 : 0,
      },
      update: {},
      include: { versions: { select: { id: true }, take: 1 } },
    });
    if (survey.versions.length === 0) {
      await db.surveyVersion.create({
        data: {
          surveyId: survey.id,
          version: surveyDefinition.version,
          schemaVersion: surveyDefinition.schemaVersion,
          definition: json(surveyDefinition),
          checksum: createHash("sha256")
            .update(JSON.stringify(surveyDefinition))
            .digest("hex"),
        },
      });
    }
    const surface = surfaces[surveyDefinition.category] ?? SurfaceValue.STANDALONE;
    await db.placement.upsert({
      where: { surveyId_surface: { surveyId: survey.id, surface } },
      create: {
        surveyId: survey.id,
        surface,
        enabled: false,
        priority: surveyDefinition.category === "purchase_motivation" ? 100 : 0,
        sampleRate: surveyDefinition.category === "purchase_motivation" ? 0.1 : 1,
        triggerConfig: json(
          surveyDefinition.category === "cart_exit"
            ? {
                type: "exit",
                mobileFallback: "timed",
                mobileDelaySeconds: 20,
              }
            : { type: "immediate" },
        ),
        styleConfig: json({ inheritShopBrand: true, density: "compact" }),
      },
      update: {},
    });
  }
}
