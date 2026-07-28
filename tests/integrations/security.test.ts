import { describe, expect, it } from "vitest";

import {
  decryptContactValue,
  encryptContactValue,
} from "../../app/services/integrations/contact-encryption";
import {
  generateInviteToken,
  verifyInviteToken,
} from "../../app/services/integrations/invite-token";
import { verifyKlaviyoFlowWebhook } from "../../app/services/integrations/klaviyo-webhook";

describe("invite tokens", () => {
  it("returns 256 bits of opaque entropy and only verifies the matching hash", () => {
    const pair = generateInviteToken({
      pepper: "deployment-secret",
      randomBytes: (size) => new Uint8Array(size).fill(7),
    });

    expect(pair.token).toHaveLength(43);
    expect(pair.tokenHash).not.toContain(pair.token);
    expect(
      verifyInviteToken(pair.token, pair.tokenHash, "deployment-secret"),
    ).toBe(true);
    expect(
      verifyInviteToken(`${pair.token}x`, pair.tokenHash, "deployment-secret"),
    ).toBe(false);
  });
});

describe("contact encryption", () => {
  const key = new Uint8Array(32).fill(11);
  const context = {
    shopId: "shop_1",
    responseSessionId: "response_1",
    questionId: "question_email",
    fieldType: "email" as const,
  };

  it("round-trips a contact value without placing plaintext in the envelope", () => {
    const envelope = encryptContactValue(
      "customer@harborinno.com",
      key,
      context,
      (size) => new Uint8Array(size).fill(3),
    );

    expect(JSON.stringify(envelope)).not.toContain("customer@harborinno.com");
    expect(decryptContactValue(envelope, key, context)).toBe(
      "customer@harborinno.com",
    );
  });

  it("binds ciphertext to its response and question context", () => {
    const envelope = encryptContactValue(
      "+49123456789",
      key,
      { ...context, fieldType: "phone" },
    );

    expect(() =>
      decryptContactValue(envelope, key, {
        ...context,
        responseSessionId: "another-response",
        fieldType: "phone",
      }),
    ).toThrow();
  });
});

describe("Klaviyo Flow webhook verification", () => {
  it("requires both the Bearer secret and an allowlisted Flow ID", () => {
    const result = verifyKlaviyoFlowWebhook(
      new Headers({
        authorization: "Bearer webhook-secret",
        "x-shopoll-flow-id": "abandoned-cart",
      }),
      {
        secret: "webhook-secret",
        allowedFlowIds: ["abandoned-cart", "post-delivery"],
      },
    );

    expect(result).toEqual({ ok: true, flowId: "abandoned-cart" });
  });

  it("rejects a valid secret from a different Flow", () => {
    expect(
      verifyKlaviyoFlowWebhook(
        {
          Authorization: "Bearer webhook-secret",
          "X-Shopoll-Flow-ID": "unknown-flow",
        },
        { secret: "webhook-secret", allowedFlowIds: ["post-delivery"] },
      ),
    ).toEqual({ ok: false, reason: "flow_not_allowed" });
  });
});
