import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { PublicSurveyRunner } from "../public/PublicSurveyRunner";
import "../styles/public-survey.css";

export const loader = ({ params }: LoaderFunctionArgs) => {
  const token = String(params.token || "");
  if (!/^[A-Za-z0-9_-]{20,512}$/.test(token)) {
    throw new Response("Survey invitation not found", { status: 404 });
  }
  return { token };
};

export const meta: MetaFunction = () => [
  { title: "Harbor Innovations Survey" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
  { name: "description", content: "Harbor Innovations customer survey" },
];

export default function StandaloneSurveyRoute() {
  const { token } = useLoaderData<typeof loader>();
  return <PublicSurveyRunner token={token} />;
}
