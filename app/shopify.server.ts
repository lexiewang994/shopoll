import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  provisionHarborShop,
  syncHarborProductMappings,
} from "./services/provision-shop.server";
import { canonicalShopDomain } from "./services/shop-domain.server";
import { logger } from "./services/logger.server";

type StoredSession = NonNullable<
  Awaited<
    ReturnType<PrismaSessionStorage<typeof prisma>["loadSession"]>
  >
>;

function createDemoSessionStorage() {
  const sessions = new Map<string, StoredSession>();
  return {
    async storeSession(session: StoredSession) {
      sessions.set(session.id, session);
      return true;
    },
    async loadSession(id: string) {
      return sessions.get(id);
    },
    async deleteSession(id: string) {
      return sessions.delete(id);
    },
    async deleteSessions(ids: string[]) {
      ids.forEach((id) => sessions.delete(id));
      return true;
    },
    async findSessionsByShop(shop: string) {
      return [...sessions.values()].filter((session) => session.shop === shop);
    },
  };
}

const configuredSessionStorage =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"
    ? createDemoSessionStorage()
    : new PrismaSessionStorage(prisma);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: configuredSessionStorage,
  distribution: AppDistribution.SingleMerchant,
  hooks: {
    afterAuth: async ({ session, admin }) => {
      const shopDomain = canonicalShopDomain(session.shop);
      await provisionHarborShop(shopDomain);
      try {
        await syncHarborProductMappings(shopDomain, admin);
      } catch (error) {
        logger.warn({
          shopDomain,
          error: error instanceof Error ? error.message : "unknown_error",
        }, "Shopify product mapping sync deferred");
      }
      await shopify.registerWebhooks({ session });
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
