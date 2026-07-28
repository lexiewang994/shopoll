import {
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

export const INVITE_TOKEN_BYTES = 32;

export interface InviteTokenPair {
  /** Returned to the customer once. Never persist this value. */
  token: string;
  /** Safe value to persist on an Invite record. */
  tokenHash: string;
}

export type RandomBytes = (size: number) => Uint8Array;

function assertToken(token: string): void {
  if (token.length === 0) {
    throw new Error("Invite token must not be empty");
  }
}

/**
 * Hashes an opaque invite token for storage. A pepper may be supplied as an
 * additional deployment secret, but the raw token is never returned here.
 */
export function hashInviteToken(token: string, pepper = ""): string {
  assertToken(token);

  return createHash("sha256")
    .update("shopoll-invite-token:v1\0", "utf8")
    .update(pepper, "utf8")
    .update("\0", "utf8")
    .update(token, "utf8")
    .digest("base64url");
}

export function generateInviteToken(
  options: {
    pepper?: string;
    randomBytes?: RandomBytes;
  } = {},
): InviteTokenPair {
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const entropy = Buffer.from(randomBytes(INVITE_TOKEN_BYTES));

  if (entropy.byteLength !== INVITE_TOKEN_BYTES) {
    throw new Error(
      `Invite token source must return exactly ${INVITE_TOKEN_BYTES} bytes`,
    );
  }

  const token = entropy.toString("base64url");
  return {
    token,
    tokenHash: hashInviteToken(token, options.pepper),
  };
}

export function verifyInviteToken(
  token: string,
  expectedHash: string,
  pepper = "",
): boolean {
  if (token.length === 0 || expectedHash.length === 0) {
    return false;
  }

  const actual = Buffer.from(hashInviteToken(token, pepper), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
