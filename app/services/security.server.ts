import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

interface SessionTokenClaims {
  aud: string | string[];
  dest: string;
  exp: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  sub?: string;
}

const encoder = new TextEncoder();

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function configuredSecret(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured in production`);
  }
  return `shopoll-development-${name.toLowerCase()}`;
}

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(configuredSecret("SHOPOLL_ENCRYPTION_KEY"))
    .digest();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashIdentifier(value: string, namespace: string): string {
  return createHmac("sha256", configuredSecret("SHOPOLL_TOKEN_PEPPER"))
    .update(`${namespace}:${value}`)
    .digest("hex");
}

export function contactIdentityHash(
  shopDomain: string,
  kind: "email" | "phone",
  value: string,
): string {
  const normalized = kind === "email"
    ? value.trim().toLowerCase()
    : value.replace(/[^0-9+]/g, "");
  return hashIdentifier(`${shopDomain.toLowerCase()}:${kind}:${normalized}`, "contact-identity");
}

export function orderConfirmationIdentityHash(
  shopDomain: string,
  confirmationNumber: string,
): string {
  return hashIdentifier(
    `${shopDomain.toLowerCase()}:${confirmationNumber.trim().toUpperCase()}`,
    "shopify-order-confirmation",
  );
}

export function createOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashIdentifier(token, "public-token") };
}

export function encryptText(value: string, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(encoder.encode(associatedData));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptText(envelope: string, associatedData: string): string {
  const [version, ivValue, tagValue, encryptedValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), base64UrlDecode(ivValue));
  decipher.setAAD(encoder.encode(associatedData));
  decipher.setAuthTag(base64UrlDecode(tagValue));
  return Buffer.concat([
    decipher.update(base64UrlDecode(encryptedValue)),
    decipher.final(),
  ]).toString("utf8");
}

export function secureEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyShopifySessionToken(token: string): SessionTokenClaims {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Response("Invalid Shopify session token", { status: 401 });
  }
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as { alg?: string };
  if (header.alg !== "HS256") {
    throw new Response("Unsupported Shopify session token", { status: 401 });
  }
  const expected = createHmac("sha256", configuredSecret("SHOPIFY_API_SECRET"))
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  if (!secureEquals(encodedSignature, expected)) {
    throw new Response("Invalid Shopify session token", { status: 401 });
  }
  const claims = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SessionTokenClaims;
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(configuredSecret("SHOPIFY_API_KEY")) || claims.exp <= now || (claims.nbf ?? 0) > now + 5) {
    throw new Response("Expired or mismatched Shopify session token", { status: 401 });
  }
  return claims;
}

export function verifyAppProxyUrl(url: URL): { shopDomain: string } {
  const signature = url.searchParams.get("signature");
  const timestamp = Number(url.searchParams.get("timestamp"));
  const shopDomain = url.searchParams.get("shop") ?? "";
  if (!signature || !timestamp || !shopDomain || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw new Response("Invalid app proxy request", { status: 401 });
  }
  const pairs = [...url.searchParams.entries()]
    .filter(([key]) => key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right));
  const candidates = [
    pairs.map(([key, value]) => `${key}=${value}`).join(""),
    pairs.map(([key, value]) => `${key}=${value}`).join("&"),
  ];
  const valid = candidates.some((message) =>
    secureEquals(
      signature,
      createHmac("sha256", configuredSecret("SHOPIFY_API_SECRET")).update(message).digest("hex"),
    ),
  );
  if (!valid) throw new Response("Invalid app proxy signature", { status: 401 });
  return { shopDomain };
}

export function publicRequestIdentity(request: Request): {
  shopDomain?: string;
  customerGid?: string;
  mode: "checkout" | "proxy" | "standalone" | "demo";
} {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const claims = verifyShopifySessionToken(authorization.slice(7));
    return {
      shopDomain: new URL(claims.dest).hostname,
      customerGid: claims.sub,
      mode: "checkout",
    };
  }
  const url = new URL(request.url);
  if (url.searchParams.has("signature")) {
    return { ...verifyAppProxyUrl(url), mode: "proxy" };
  }
  if (process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production") {
    return { shopDomain: "shop.harborinno.com", mode: "demo" };
  }
  return { mode: "standalone" };
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}
