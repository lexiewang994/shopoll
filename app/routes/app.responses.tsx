import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import { LiveResponsesPage } from "../components/LiveResponsesPage";
import {
  adminAnalyticsFilter,
  adminAnalyticsView,
} from "../services/admin-view-data.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { filter, query } = adminAnalyticsFilter(request);
  const { responses } = await adminAnalyticsView(
    canonicalShopDomain(session.shop),
    filter,
  );
  return { rows: responses, query };
};

export default function ResponsesRoute() {
  const { t } = useAdminI18n();
  const { rows, query } = useLoaderData<typeof loader>();
  const exportHref = `/app/responses.csv${query ? `?${query}` : ""}`;
  return (
    <s-page>
      <LiveResponsesPage
        rows={rows}
        exportAction={
          <s-button href={exportHref} variant="secondary">
            <s-icon type="export" />
            {t("导出 CSV")}
          </s-button>
        }
      />
    </s-page>
  );
}
