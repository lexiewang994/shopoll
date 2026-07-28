import { jsonResponse, publicRequestIdentity } from "../security.server";
import { RuntimeError, isRecord } from "./common.server";
import { runtimeErrorResponse } from "./public-surveys.server";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, PUT, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type, Idempotency-Key, X-Shopoll-Client",
  "access-control-max-age": "86400",
};

export function publicPreflight(request: Request): Response | null {
  return request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: CORS_HEADERS })
    : null;
}

export async function publicJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    throw new RuntimeError(413, "payload_too_large", "Public request bodies are limited to 64 KB");
  }
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > 65_536) {
    throw new RuntimeError(413, "payload_too_large", "Public request bodies are limited to 64 KB");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new RuntimeError(400, "invalid_json", "A valid JSON body is required");
  }
  if (!isRecord(value)) throw new RuntimeError(400, "invalid_request", "A JSON object is required");
  return value;
}

export function publicSuccess(data: unknown, status = 200): Response {
  return jsonResponse(data, { status, headers: CORS_HEADERS });
}

export async function handlePublicAction(
  request: Request,
  handler: (body: Record<string, unknown>, identity: ReturnType<typeof publicRequestIdentity>) => Promise<unknown>,
): Promise<Response> {
  const preflight = publicPreflight(request);
  if (preflight) return preflight;
  if (request.method !== "POST" && request.method !== "PUT") {
    return publicSuccess({ error: { code: "method_not_allowed" } }, 405);
  }
  try {
    const body = await publicJsonBody(request);
    const identity = publicRequestIdentity(request);
    return publicSuccess(await handler(body, identity));
  } catch (error) {
    if (error instanceof Response) {
      const headers = new Headers(error.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
      return new Response(error.body, { status: error.status, statusText: error.statusText, headers });
    }
    const response = runtimeErrorResponse(error);
    for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
    return response;
  }
}
