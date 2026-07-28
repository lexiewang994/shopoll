# Launch checklist

## Development store

- [ ] App Home loads in Shopify Admin in Chinese and English.
- [ ] All seven templates exist as drafts and all placements are disabled.
- [ ] English, German and Spanish publication validation passes.
- [ ] Theme inline and popup surfaces work on desktop and mobile.
- [ ] Mobile exit intent falls back to elapsed-time or scroll trigger.
- [ ] Thank you and Order status blocks render for an eligible test order.
- [ ] Single core product auto-routes; multi-product orders ask for the main product; accessory-only orders do not resolve.
- [ ] Each answer appears after selection and a refresh resumes the session.
- [ ] Duplicate complete requests issue no second reward.
- [ ] Klaviyo test profile receives all four survey lifecycle events.
- [ ] Weekly report shows deterministic week-over-week values.
- [ ] Default CSV excludes encrypted contact answers.
- [ ] Privacy request/redaction and retention jobs pass against test data.

## Production rollout

- [ ] Install with all placements disabled.
- [ ] Publish only the purchase-motivation survey, with no reward.
- [ ] Enable at 10% for 48 hours.
- [ ] Confirm API error rate, response funnel, locale split and order correlation.
- [ ] Raise to 100% only after review.
- [ ] Enable each remaining surface separately.

If the shop plan does not support the Thank you block, keep that placement off
and use the post-order Klaviyo standalone-link flow.
