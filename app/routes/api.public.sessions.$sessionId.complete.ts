import type { ActionFunctionArgs } from "react-router";
import { handlePublicAction } from "../services/runtime/http.server";
import { completePublicSession } from "../services/runtime/public-surveys.server";

export const action = ({ request, params }: ActionFunctionArgs) =>
  handlePublicAction(request, (body, identity) =>
    completePublicSession(params.sessionId, body, identity));
