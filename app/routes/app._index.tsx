import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { useAdminI18n } from "../components/AdminI18n";
import { LiveDashboardPage } from "../components/LiveDashboardPage";
import { adminDashboardView } from "../services/admin-view-data.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    data: await adminDashboardView(canonicalShopDomain(session.shop)),
  };
};

export default function OverviewRoute() {
  const { t } = useAdminI18n();
  const { data } = useLoaderData<typeof loader>();
  return (
    <s-page>
      <LiveDashboardPage
        data={data}
        createAction={
          <s-button href="/app/surveys/new" variant="primary">
            <s-icon type="plus" />
            {t("新建问卷")}
          </s-button>
        }
        settingsAction={
          <s-button href="/app/integrations" variant="tertiary">
            {t("前往设置")}
          </s-button>
        }
      />
    </s-page>
  );
}
