import type { ActionFunctionArgs } from "react-router";
import { handlePublicAction } from "../services/runtime/http.server";
import { recordPublicImpression } from "../services/runtime/public-surveys.server";

export const action = ({ request }: ActionFunctionArgs) =>
  handlePublicAction(request, recordPublicImpression);
