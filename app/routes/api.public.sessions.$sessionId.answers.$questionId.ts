import type { ActionFunctionArgs } from "react-router";
import { handlePublicAction } from "../services/runtime/http.server";
import { upsertPublicAnswer } from "../services/runtime/public-surveys.server";

export const action = ({ request, params }: ActionFunctionArgs) =>
  handlePublicAction(request, (body, identity) =>
    upsertPublicAnswer(params.sessionId, params.questionId, body, identity));
