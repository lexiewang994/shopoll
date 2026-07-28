/// <reference types="@shopify/ui-extensions/customer-account.order-status.block.render" />

import {waitFor} from "@testing-library/preact";
import {getExtension} from "@shopify/ui-extensions-tester";
import {render} from "preact";
import {afterEach, beforeEach, expect, test, vi} from "vitest";

const extension = getExtension("customer-account.order-status.block.render");

beforeEach(() => extension.setUp());
afterEach(() => {
  render(null, document.body);
  extension.tearDown();
});

test("resolves the Order status placement with the current order", async () => {
  extension.shopify.order.value = {
    ...extension.shopify.order.value,
    id: extension.shopify.order.value?.id ?? "gid://shopify/Order/1",
    name: extension.shopify.order.value?.name ?? "#1001",
    confirmationNumber: "HARBOR42",
  };
  extension.shopify.settings.value = {
    api_url: "https://poll.example/api/public",
    order_status_placement: "order-status",
  };
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({eligible: false}), {
      status: 200,
      headers: {"Content-Type": "application/json"},
    }),
  );
  extension.fetch = fetchMock as typeof fetch;

  // The tester's render helper passes Windows drive paths directly to Node's ESM loader.
  const {default: renderExtension} = await import("../src/order-status");
  await renderExtension();

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://poll.example/api/public/surveys/resolve");
  expect(JSON.parse(String(request.body)).context).toMatchObject({
    surface: "order_status",
    orderGid: "gid://shopify/Order/1",
    orderConfirmationNumber: "HARBOR42",
    placementKey: "order-status",
  });
  await waitFor(() => expect(document.body.textContent).not.toContain("loading"));
});
