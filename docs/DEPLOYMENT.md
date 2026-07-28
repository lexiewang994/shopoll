# Railway deployment

This guide is for a Harbor-controlled dogfood or self-hosted deployment. It is
not the install path for a future hosted Shopoll App Store product.

## Services

Create a Railway PostgreSQL service plus two application services from the same
repository. The web service uses `railway.toml`; the worker service uses
`railway.worker.toml`. Both must share the same `DATABASE_URL` and encryption
secrets.

## Required variables

- Shopify: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_SHOP_DOMAIN`, `SCOPES`
- Shopoll: `SHOP_CUSTOM_DOMAIN`, `SHOPOLL_PUBLIC_URL`, `SHOPOLL_ENCRYPTION_KEY`, `SHOPOLL_TOKEN_PEPPER`
- Klaviyo: `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_FLOW_SECRET`, `KLAVIYO_ALLOWED_FLOW_IDS`
- Runtime: `DATABASE_URL`, `NODE_ENV=production`

Generate `SHOPOLL_ENCRYPTION_KEY` as 32 random bytes encoded with base64url and
use a separate high-entropy value for `SHOPOLL_TOKEN_PEPPER`. Store both only in
Railway secrets. Rotating the encryption key requires an explicit re-encryption
migration.

`SHOPIFY_SHOP_DOMAIN` is the production store's canonical `*.myshopify.com`
domain. Shopoll fails closed in production when it is absent or when an
authenticated Shopify request belongs to another store.

## Sequence

1. Deploy PostgreSQL, web and worker services. Railway runs `npm run setup`
   only as the web service's pre-deploy command; the worker never runs database
   migrations.
2. Confirm `/healthz` and `/readyz` return success.
3. Run `npm run db:seed` once against the production database.
4. Point `poll.harborinno.com` at Railway and verify TLS.
5. Update the Shopify application URL, redirect URL and App Proxy URL.
6. Deploy the Shopify extensions with `npm run deploy`.
7. Configure Klaviyo and send a test event/profile.
8. Install on the production shop with every placement still disabled.

The web pre-deploy command runs `prisma migrate deploy`; it never uses `db push`
in production. A Railway rollback rolls back application code, not the
database. Schema changes must therefore follow an expand/contract migration
strategy and remain compatible with the preceding application version.
