import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import { LiveAnalyticsPage } from "../components/LiveAnalyticsPage";
import {
  adminAnalyticsFilter,
  adminAnalyticsView,
} from "../services/admin-view-data.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { filter, current, query } = adminAnalyticsFilter(request);
  const { view } = await adminAnalyticsView(
    canonicalShopDomain(session.shop),
    filter,
  );
  return { data: view, current, query };
};

export default function AnalyticsRoute() {
  const { t } = useAdminI18n();
  const { data, current, query } = useLoaderData<typeof loader>();
  const exportHref = `/app/responses.csv${query ? `?${query}` : ""}`;
  return (
    <s-page>
      <LiveAnalyticsPage
        data={data}
        current={current}
        exportAction={
          <s-button href={exportHref} variant="secondary">
            <s-icon type="download" />
            {t("导出 CSV")}
          </s-button>
        }
      />
    </s-page>
  );
}
