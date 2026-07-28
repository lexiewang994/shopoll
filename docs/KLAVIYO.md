# Klaviyo setup

Shopoll deliberately leaves consent, unsubscribe handling, message delays and
message templates in Klaviyo Flow.

## Events emitted by Shopoll

- `Survey Ready`
- `Survey Started`
- `Survey Completed`
- `Reward Issued`
- `Shopoll Weekly Report`

Every event uses a deterministic `unique_id`, so Worker retries do not create
duplicate profile activity.

## Abandonment and post-delivery flows

1. Create a Klaviyo Flow from the appropriate commerce trigger.
2. Add a webhook action to `https://poll.harborinno.com/api/integrations/klaviyo/invites`.
3. Set `Authorization: Bearer <KLAVIYO_FLOW_SECRET>`.
4. Set `X-Shopoll-Flow-ID` to the Flow ID and add it to `KLAVIYO_ALLOWED_FLOW_IDS`.
5. Send only the required profile reference, event/order reference, survey slug and locale.
6. Add email/SMS actions triggered by the resulting `Survey Ready` event.

Use a dedicated Klaviyo test profile first. Never put the private API key or Flow
secret into theme, Checkout or browser code.
