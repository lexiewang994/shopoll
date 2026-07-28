import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import "../styles/shopoll.css";
import { AdminI18nProvider } from "../components/AdminI18n";
import { ShopollDemo } from "../components/ShopollDemo";

export const loader = ({ request }: LoaderFunctionArgs) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEMO_MODE !== "true"
  ) {
    throw new Response("Not found", { status: 404 });
  }

  const requestedLocale = new URL(request.url).searchParams.get("adminLocale");
  return { adminLocale: requestedLocale === "en" ? "en" : "zh-CN" };
};

export const meta: MetaFunction = () => [
  { title: "Shopoll · Harbor Research" },
  {
    name: "description",
    content: "Harbor Innovations customer research dashboard",
  },
];

export default function DemoRoute() {
  const { adminLocale } = useLoaderData<typeof loader>();

  return (
    <AdminI18nProvider initialLocale={adminLocale}>
      <ShopollDemo />
    </AdminI18nProvider>
  );
}
