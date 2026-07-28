import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import "../styles/shopoll.css";
import { LiveSettingsPage } from "../components/LiveSettingsPage";
import { adminSettingsView } from "../services/admin-view-data.server";
import { canonicalShopDomain } from "../services/shop-domain.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    initial: await adminSettingsView(canonicalShopDomain(session.shop)),
  };
};

export default function SettingsRoute() {
  const { initial } = useLoaderData<typeof loader>();
  return (
    <s-page>
      <LiveSettingsPage initial={initial} />
    </s-page>
  );
}
