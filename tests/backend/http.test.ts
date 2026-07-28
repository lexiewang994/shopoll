import { describe, expect, it } from "vitest";

import { publicJsonBody } from "../../app/services/runtime/http.server";

describe("public request limits", () => {
  it("rejects an oversized chunked body even without Content-Length", async () => {
    const request = new Request("https://poll.harborinno.com/api/public/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(65_537) }),
    });

    await expect(publicJsonBody(request)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });

  it("accepts a normal JSON object", async () => {
    const request = new Request("https://poll.harborinno.com/api/public/sessions", {
      method: "POST",
      body: JSON.stringify({ schemaVersion: 1 }),
    });

    await expect(publicJsonBody(request)).resolves.toEqual({ schemaVersion: 1 });
  });
});
