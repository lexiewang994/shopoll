/// <reference types="@shopify/ui-extensions/purchase.thank-you.block.render" />

import {fireEvent, waitFor} from "@testing-library/preact";
import {getExtension} from "@shopify/ui-extensions-tester";
import {render} from "preact";
import {afterEach, beforeEach, expect, test, vi} from "vitest";

const extension = getExtension("purchase.thank-you.block.render");

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {"Content-Type": "application/json"},
  });
}

beforeEach(() => extension.setUp());
afterEach(() => {
  render(null, document.body);
  extension.tearDown();
});

test("renders, saves, and completes an eligible Thank you survey", async () => {
  extension.shopify.orderConfirmation.value = {
    ...extension.shopify.orderConfirmation.value,
    number: "HARBOR42",
  };
  extension.shopify.settings.value = {
    api_url: "https://poll.example",
    thank_you_placement: "thank-you",
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.endsWith("/surveys/resolve")) {
      return json({
        eligible: true,
        survey: {
          id: "survey-1",
          versionId: "version-1",
          definition: {
            schemaVersion: 1,
            title: "Harbor purchase survey",
            questions: [
              {
                id: "reason",
                type: "single_choice",
                title: "Why did you choose Harbor?",
                options: [{id: "eye-care", label: "Eye comfort"}],
              },
            ],
          },
        },
        placement: {id: "placement-1"},
      });
    }
    if (url.endsWith("/sessions")) return json({id: "session-1", resumeToken: "resume-1"});
    if (url.endsWith("/impressions")) return json({ok: true});
    if (url.endsWith("/answers")) return json({});
    if (url.endsWith("/complete")) return json({reward: {code: "THANKS10"}});
    return json({});
  });
  extension.fetch = fetchMock as typeof fetch;

  // The tester's render helper passes Windows drive paths directly to Node's ESM loader.
  const {default: renderExtension} = await import("../src/thank-you");
  await renderExtension();

  await waitFor(() => {
    expect(document.body.textContent).toContain("Why did you choose Harbor?");
  });
  const choiceList = document.body.querySelector("s-choice-list") as HTMLElement & {
    values: string[];
  };
  choiceList.values = ["eye-care"];
  fireEvent.change(choiceList);

  const next = Array.from(document.body.querySelectorAll("s-button")).find(
    (button) => button.textContent === "next",
  );
  expect(next).toBeTruthy();
  fireEvent.click(next!);

  await waitFor(() => {
    expect(document.body.textContent).toContain("THANKS10");
  });

  const resolveCall = fetchMock.mock.calls.find(([input]) =>
    String(input).endsWith("/surveys/resolve"),
  );
  expect(resolveCall).toBeTruthy();
  const request = resolveCall?.[1] as RequestInit;
  const body = JSON.parse(String(request.body));
  expect(body.context).toMatchObject({
    surface: "thank_you",
    orderGid: "gid://shopify/Order/1",
    orderConfirmationNumber: "HARBOR42",
    placementKey: "thank-you",
  });
  const protectedCalls = fetchMock.mock.calls.filter(([input]) =>
    /\/impressions|\/answers|\/complete/.test(String(input)),
  );
  expect(protectedCalls).not.toHaveLength(0);
  for (const [, protectedRequest] of protectedCalls) {
    expect(JSON.parse(String(protectedRequest?.body))).toMatchObject({resumeToken: "resume-1"});
  }
  expect(request.headers).toMatchObject({Authorization: "Bearer mock-session-token"});
});
