# Public API v1

All request bodies are JSON. Write requests use `Idempotency-Key` where the
surface permits headers, and also accept `idempotencyKey` in the body for
Checkout and theme-extension compatibility.

## Resolve survey

`POST /api/public/surveys/resolve`

```json
{
  "schemaVersion": 1,
  "context": {
    "surface": "theme_popup",
    "placementKey": "product-exit",
    "locale": "en-US",
    "device": "desktop",
    "page": { "type": "product", "path": "/products/paper7" },
    "visitorToken": "page-or-consented-visitor-token",
    "analyticsAllowed": true
  }
}
```

Returns `{ "eligible": false }` when nothing is eligible, otherwise the
localized immutable survey version and placement metadata. When analytics
consent is false, the visitor token remains page-scoped and cross-page behavior
is ignored.

Checkout surfaces put `orderGid` and `orderConfirmationNumber` in `context`.
Shopoll compares the confirmation-number hash with the signed Shopify order
webhook before using any order facts. App Proxy clients are rejected if they
attempt to supply order context.

## Create or resume session

`POST /api/public/sessions`

```json
{
  "schemaVersion": 1,
  "surveyId": "survey-id",
  "surveyVersionId": "version-id",
  "placementId": "placement-id",
  "context": {
    "surface": "theme_popup",
    "placementKey": "product-exit",
    "visitorToken": "same-token-used-for-resolve"
  },
  "idempotencyKey": "client-generated-key"
}
```

Session creation re-evaluates the active version, placement, audience, sample,
frequency cap, date window and response cap. A public version/placement ID alone
does not authorize a response. To resume, send the returned `resumeToken` with
the same survey version.

## Upsert answer

`POST /api/public/sessions/:sessionId/answers` (the question-ID path variant is
also supported)

```json
{
  "schemaVersion": 1,
  "questionId": "paper7_reason",
  "value": "eye_comfort",
  "idempotencyKey": "one-key-per-answer-change",
  "resumeToken": "required-session-token"
}
```

Each successful selection is persisted immediately. Repeating the same key and
payload is a no-op; reusing a key with different content is rejected.

Optional unanswered questions use the same endpoint with an explicit skip
operation. The server rejects skips for required or unreachable questions,
clears answers from branches that are no longer reachable, and returns the
authoritative navigation directive.

```json
{
  "schemaVersion": 1,
  "questionId": "optional_detail",
  "skipped": true,
  "idempotencyKey": "one-key-per-skip",
  "resumeToken": "required-session-token"
}
```

## Complete and reward

`POST /api/public/sessions/:sessionId/complete`

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "completion-key",
  "resumeToken": "required-session-token"
}
```

Completion is atomic. A retry returns the original result and cannot issue a
second reward.

## Pixel events

The Web Pixel posts to `/apps/shopoll/pixel/events`, which Shopify forwards to
`POST /api/public/pixel/events` through the signed App Proxy. The endpoint
accepts only the fixed anonymous event schema for page view, product view, add
to cart, checkout start and checkout complete. Arbitrary URLs, query strings,
customer fields and checkout identity fields are dropped. With analytics
consent, the pixel and Theme Extension share the `shopoll_visitor` first-party
cookie so recent cart and UTM history can be used for audience matching.

## Klaviyo Flow invite

`POST /api/integrations/klaviyo/invites` requires
`Authorization: Bearer <KLAVIYO_FLOW_SECRET>` and
`X-Shopoll-Flow-ID: <allowlisted-id>`. Duplicate webhook deliveries reuse the
same invite and Klaviyo event.
