import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { LiveIntegrationsPage } from "../components/LiveIntegrationsPage";
import { adminIntegrationsView } from "../services/admin-view-data.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    data: await adminIntegrationsView(canonicalShopDomain(session.shop)),
  };
};

export default function IntegrationsRoute() {
  const { data } = useLoaderData<typeof loader>();
  return (
    <s-page>
      <LiveIntegrationsPage data={data} />
    </s-page>
  );
}
