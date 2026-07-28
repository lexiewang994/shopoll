import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { AdminI18nProvider, useAdminI18n } from "../components/AdminI18n";
import db from "../db.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = canonicalShopDomain(session.shop);
  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    select: { adminLocale: true },
  });

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    adminLocale: shop?.adminLocale ?? "zh-CN",
  };
};

export default function App() {
  const { apiKey, adminLocale } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AdminI18nProvider initialLocale={adminLocale}>
        <AdminShell />
      </AdminI18nProvider>
    </AppProvider>
  );
}

function AdminShell() {
  const { t } = useAdminI18n();
  return (
    <>
      <NavMenu>
        <a href="/app" rel="home">
          {t("概览")}
        </a>
        <a href="/app/surveys">{t("问卷")}</a>
        <a href="/app/responses">{t("回答")}</a>
        <a href="/app/analytics">{t("分析")}</a>
        <a href="/app/integrations">{t("集成")}</a>
        <a href="/app/settings">{t("设置")}</a>
      </NavMenu>
      <Outlet />
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
