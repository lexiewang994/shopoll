import type {
  AudienceContext,
  CompleteResponse,
  NavigationDirective,
  PlacementEnvelope,
  ResolveResponse,
  ResponseSession,
  SurveyEnvelope,
  SurveyQuestion,
} from "./contracts";
import {stableHash, unwrap} from "./contracts";

const COMPILED_APP_URL =
  typeof process === "undefined" ? "" : process?.env.SHOPIFY_APP_URL ?? "";

function operationRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function resolveApiBase(
  configuredUrl?: unknown,
  compiledAppUrl = COMPILED_APP_URL,
): string {
  const configured = String(configuredUrl ?? "").trim();
  const raw = String(configured || compiledAppUrl).trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "";
    }
    const existingPath = url.pathname.replace(/\/$/, "");
    const apiPath = existingPath.endsWith("/api/public")
      ? existingPath
      : `${existingPath}/api/public`;
    return `${url.origin}${apiPath}`;
  } catch {
    return "";
  }
}

interface ClientOptions {
  apiBase: string;
  getSessionToken: () => Promise<string>;
}

export class BackendClient {
  private readonly apiBase: string;
  private readonly getSessionToken: () => Promise<string>;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly answerRunId = operationRunId();
  private answerSequence = 0;

  constructor(options: ClientOptions) {
    this.apiBase = options.apiBase;
    this.getSessionToken = options.getSessionToken;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    if (!this.apiBase) throw new Error("missing_api_base");
    const token = await this.getSessionToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Shopoll-Client": "checkout-v1",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`request_failed_${response.status}`);
      return unwrap((await response.json()) as T | {data: T});
    } finally {
      clearTimeout(timeout);
    }
  }

  resolve(context: AudienceContext): Promise<ResolveResponse> {
    return this.request("/surveys/resolve", {schemaVersion: 1, context});
  }

  createSession(
    survey: SurveyEnvelope,
    placement: PlacementEnvelope | undefined,
    context: AudienceContext,
  ): Promise<ResponseSession> {
    const surveyVersionId =
      survey.versionId ?? survey.surveyVersionId ?? survey.definition?.versionId;
    return this.request("/sessions", {
      schemaVersion: 1,
      surveyId: survey.id ?? survey.definition?.surveyId,
      surveyVersionId,
      placementId: placement?.id,
      context,
      idempotencyKey: `session:${context.surface}:${context.orderGid}:${surveyVersionId}:${placement?.id ?? ""}`,
    });
  }

  impression(
    session: ResponseSession,
    survey: SurveyEnvelope,
    placement: PlacementEnvelope | undefined,
    context: AudienceContext,
  ): Promise<unknown> {
    const sessionId = session.id ?? session.sessionId;
    return this.request("/impressions", {
      schemaVersion: 1,
      sessionId,
      surveyId: survey.id ?? survey.definition?.surveyId,
      surveyVersionId:
        survey.versionId ?? survey.surveyVersionId ?? survey.definition?.versionId,
      placementId: placement?.id,
      resumeToken: session.resumeToken,
      context,
      idempotencyKey: `impression:${sessionId}`,
    });
  }

  answer(
    session: ResponseSession,
    question: SurveyQuestion,
    value: unknown,
    skipped = false,
  ): Promise<NavigationDirective> {
    const sessionId = session.id ?? session.sessionId;
    const operationSequence = ++this.answerSequence;
    const operation = () =>
      this.request<NavigationDirective>(`/sessions/${encodeURIComponent(String(sessionId))}/answers`, {
        schemaVersion: 1,
        questionId: question.id,
        ...(skipped ? {skipped: true} : {value}),
        resumeToken: session.resumeToken,
        idempotencyKey: `answer:${sessionId}:${question.id}:${this.answerRunId}:${operationSequence}:${stableHash(skipped ? "skipped" : value)}`,
      });
    const queued = this.queue.catch(() => undefined).then(operation);
    this.queue = queued;
    return queued;
  }

  complete(session: ResponseSession): Promise<CompleteResponse> {
    const sessionId = session.id ?? session.sessionId;
    const operation = () =>
      this.request<CompleteResponse>(`/sessions/${encodeURIComponent(String(sessionId))}/complete`, {
        schemaVersion: 1,
        resumeToken: session.resumeToken,
        idempotencyKey: `complete:${sessionId}`,
      });
    const queued = this.queue.catch(() => undefined).then(operation);
    this.queue = queued;
    return queued;
  }
}
