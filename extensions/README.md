# Shopoll Shopify extensions

This directory contains three independently deployable Shopify extensions:

- `shopoll-theme`: Theme app extension with an inline block and popup app embed.
- `shopoll-checkout`: One multi-page UI extension for Thank you and Order status blocks.
- `shopoll-web-pixel`: Consent-gated app pixel for pseudonymous commerce events.

## Root app integration

The root app must expose the frozen public flow below. JSON responses may be returned directly or inside `{ "data": ... }`.

1. `POST /api/public/surveys/resolve`
2. `POST /api/public/sessions`
3. `POST /api/public/impressions`
4. `POST /api/public/sessions/:sessionId/answers`
5. `POST /api/public/sessions/:sessionId/complete`
6. `POST /api/public/pixel/events`

Theme requests use `/apps/shopoll` and append the frozen endpoint paths above. Shopify therefore forwards `/apps/shopoll/surveys/resolve` to `/api/public/surveys/resolve`. Authenticate every request with Shopify App Proxy signature verification and configure the root app with the equivalent of:

```toml
[app_proxy]
url = "/api/public"
prefix = "apps"
subpath = "shopoll"
```

Checkout and customer-account requests send a fresh Shopify session token as `Authorization: Bearer <JWT>`. Validate the signature, expiration, audience, destination shop, and order/customer authorization server-side. UI extension requests require CORS responses for the worker's null origin, including `Access-Control-Allow-Origin: *` and allowances for `Authorization`, `Content-Type`, and `X-Shopoll-Client`.

The Checkout extension resolves its API origin in this order: the `api_url` block setting, then build-time `SHOPIFY_APP_URL`. Configure only a public HTTPS origin; never place credentials in extension settings.

## Pixel activation

The root app needs `write_app_proxy`, `write_pixels`, and `read_customer_events`, and must create one WebPixel record after installation. Set its JSON settings to the deployed app origin:

```json
{"endpointUrl":"https://poll.example.com"}
```

The pixel runs only with analytics consent and sends only a hashed Shopify client ID, shop domain, path, fixed UTM fields, locale/device class, product or variant GIDs, quantities, order GID, and monetary totals. The endpoint must allow CORS, reject unknown shop domains, rate-limit by shop and event ID, and use the Shopify event ID as its idempotency key. It must never infer or accept customer PII from this endpoint.

## Shopify configuration

- Use API version `2026-07` for app webhooks and Admin API calls that support extension setup.
- Request checkout UI extension network access in the Dev Dashboard before previewing the post-purchase blocks.
- Add the inline block or enable the popup app embed in the Theme Editor.
- Add both post-purchase block targets in the Checkout and Accounts Editor.
- Create and connect the app pixel in **Settings > Customer events**.
- Preserve the committed extension `handle` and `uid` values after the first deployment.

## Local verification

```powershell
npm test --workspace shopoll-theme
npm test --workspace shopoll-checkout
npm run typecheck --workspace shopoll-checkout
npm test --workspace shopoll-web-pixel
npm run typecheck --workspace shopoll-web-pixel
```

The theme JavaScript is dependency-free and currently compresses below the 10 KB startup budget. Checkout uses only Preact and Shopify's `2026.7.0` Polaris web components.
