import assert from "node:assert/strict";
import test from "node:test";

import {BackendClient, resolveApiBase} from "../src/backend";
import {
  isAnswered,
  localized,
  nextQuestion,
  questionType,
  stableHash,
  type SurveyQuestion,
} from "../src/contracts";

test("API configuration only accepts HTTPS or local development", () => {
  assert.equal(resolveApiBase("http://example.com"), "");
  assert.equal(resolveApiBase("https://poll.example/"), "https://poll.example/api/public");
  assert.equal(
    resolveApiBase("https://poll.example/api/public"),
    "https://poll.example/api/public",
  );
  assert.equal(
    resolveApiBase("", "https://compiled.example"),
    "https://compiled.example/api/public",
  );
  assert.equal(resolveApiBase("http://localhost:3000"), "http://localhost:3000/api/public");
});

test("question aliases normalize to the versioned contract", () => {
  assert.equal(questionType("radio"), "single_choice");
  assert.equal(questionType("welcome-page"), "welcome");
  assert.equal(questionType("stars"), "rating");
});

test("branching uses the first matching rule and preserves explicit completion", () => {
  const questions: SurveyQuestion[] = [
    {
      id: "source",
      type: "single_choice",
      logic: [{operator: "equals", value: "paper7", targetQuestionId: "paper7"}],
    },
    {id: "fallback", type: "short_text"},
    {id: "paper7", type: "single_choice", next: "complete"},
  ];
  assert.deepEqual(nextQuestion(questions[0], "paper7", questions), {nextQuestionId: "paper7"});
  assert.deepEqual(nextQuestion(questions[2], "eyes", questions), {complete: true});
});

test("localized content falls back to English", () => {
  assert.equal(localized({en: "Thanks", de: "Danke"}, "es-MX"), "Thanks");
});

test("contact answer requires a value and stable hashes are deterministic", () => {
  assert.equal(isAnswered({value: "", consent: true}), false);
  assert.equal(isAnswered({value: "customer@example.com", consent: true}), true);
  assert.equal(isAnswered({email: "customer@example.com", consent: true}), true);
  assert.equal(stableHash(["a", "b"]), stableHash(["a", "b"]));
  assert.equal(stableHash(undefined), stableHash(undefined));
  assert.notEqual(stableHash(undefined), stableHash(null));
});

test("optional questions use the explicit server-side skip protocol", async () => {
  const previousFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response("{}", {status: 200, headers: {"Content-Type": "application/json"}});
  }) as typeof fetch;
  try {
    const client = new BackendClient({
      apiBase: "https://poll.example/api/public",
      getSessionToken: async () => "session-token",
    });
    await client.answer(
      {id: "session-1", resumeToken: "resume-1"},
      {id: "optional", type: "short_text", required: false},
      undefined,
      true,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(body.skipped, true);
  assert.equal(Object.hasOwn(body, "value"), false);
});

test("session idempotency is bound to the full order, version, and placement tuple", async () => {
  const previousFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response("{}", {status: 200, headers: {"Content-Type": "application/json"}});
  }) as typeof fetch;
  try {
    const client = new BackendClient({
      apiBase: "https://poll.example/api/public",
      getSessionToken: async () => "session-token",
    });
    await client.createSession(
      {id: "survey-1", versionId: "version-1"},
      {id: "placement-1"},
      {
        surface: "thank_you",
        placementKey: "thank-you",
        orderGid: "gid://shopify/Order/42",
        orderConfirmationNumber: "HARBOR42",
        locale: "en",
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(
    body.idempotencyKey,
    "session:thank_you:gid://shopify/Order/42:version-1:placement-1",
  );
});

test("a repeated answer after another edit gets a new idempotency operation", async () => {
  const previousFetch = globalThis.fetch;
  const bodies: Array<{idempotencyKey: string; resumeToken?: string}> = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", {status: 200, headers: {"Content-Type": "application/json"}});
  }) as typeof fetch;
  try {
    const client = new BackendClient({
      apiBase: "https://poll.example/api/public",
      getSessionToken: async () => "session-token",
    });
    const session = {id: "session-1", resumeToken: "resume-1"};
    const question: SurveyQuestion = {id: "reason", type: "single_choice"};
    await client.answer(session, question, "a");
    await client.answer(session, question, "b");
    await client.answer(session, question, "a");
    const resumedClient = new BackendClient({
      apiBase: "https://poll.example/api/public",
      getSessionToken: async () => "session-token",
    });
    await resumedClient.answer(session, question, "a");
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(new Set(bodies.map((body) => body.idempotencyKey)).size, 4);
  assert.deepEqual(bodies.map((body) => body.resumeToken), [
    "resume-1",
    "resume-1",
    "resume-1",
    "resume-1",
  ]);
});
