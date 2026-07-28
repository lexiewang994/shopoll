import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;

export type ContactFieldType = "email" | "name" | "phone";

export interface ContactEncryptionContext {
  shopId: string;
  responseSessionId: string;
  questionId: string;
  fieldType: ContactFieldType;
}

export interface EncryptedContactValueV1 {
  version: 1;
  algorithm: "A256GCM";
  iv: string;
  ciphertext: string;
  authTag: string;
}

export type EncryptionRandomBytes = (size: number) => Uint8Array;

function assertEncryptionKey(key: Uint8Array): Buffer {
  const normalized = Buffer.from(key);
  if (normalized.byteLength !== AES_KEY_BYTES) {
    throw new Error("Contact encryption key must contain exactly 32 bytes");
  }
  return normalized;
}

function assertContext(context: ContactEncryptionContext): void {
  if (
    context.shopId.length === 0 ||
    context.responseSessionId.length === 0 ||
    context.questionId.length === 0
  ) {
    throw new Error("Contact encryption context must be complete");
  }
}

function additionalAuthenticatedData(context: ContactEncryptionContext): Buffer {
  assertContext(context);
  return Buffer.from(
    JSON.stringify([
      "shopoll-contact",
      1,
      context.shopId,
      context.responseSessionId,
      context.questionId,
      context.fieldType,
    ]),
    "utf8",
  );
}

export function contactEncryptionKeyFromBase64(value: string): Buffer {
  if (value.length === 0) {
    throw new Error("Contact encryption key is missing");
  }
  return assertEncryptionKey(Buffer.from(value, "base64"));
}

export function encryptContactValue(
  plaintext: string,
  key: Uint8Array,
  context: ContactEncryptionContext,
  randomBytes: EncryptionRandomBytes = nodeRandomBytes,
): EncryptedContactValueV1 {
  const encryptionKey = assertEncryptionKey(key);
  const iv = Buffer.from(randomBytes(GCM_IV_BYTES));
  if (iv.byteLength !== GCM_IV_BYTES) {
    throw new Error(`Encryption IV source must return exactly ${GCM_IV_BYTES} bytes`);
  }

  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(additionalAuthenticatedData(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    algorithm: "A256GCM",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptContactValue(
  envelope: EncryptedContactValueV1,
  key: Uint8Array,
  context: ContactEncryptionContext,
): string {
  if (envelope.version !== 1 || envelope.algorithm !== "A256GCM") {
    throw new Error("Unsupported contact encryption envelope");
  }

  const iv = Buffer.from(envelope.iv, "base64url");
  const authTag = Buffer.from(envelope.authTag, "base64url");
  if (iv.byteLength !== GCM_IV_BYTES || authTag.byteLength !== GCM_AUTH_TAG_BYTES) {
    throw new Error("Invalid contact encryption envelope");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    assertEncryptionKey(key),
    iv,
  );
  decipher.setAAD(additionalAuthenticatedData(context));
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
