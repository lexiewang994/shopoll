# Shopoll

Shopoll is an open-source Shopify survey system for understanding why customers
buy, hesitate, abandon carts and recommend products. It combines on-site,
checkout, standalone-link and Klaviyo delivery while keeping every published
survey version immutable.

## Project status

Shopoll is currently in Harbor Innovations dogfood. The checked-in Shopify
configuration and seed templates target `shop.harborinno.com`; they are not a
public App Store installation yet. Every placement is disabled by default.

The intended distribution model is:

- **Hosted Shopoll:** merchants install a separate public Shopify app when the
  App Store release is ready.
- **Self-hosted Shopoll:** developers deploy this repository with their own
  Shopify app credentials, PostgreSQL, Railway project and domain.
- **Harbor dogfood:** uses its own custom-distribution Shopify app and isolated
  production environment.

Shopify locks a custom app and a public App Store app into different
distribution models, so dogfood and public installations must remain separate
Shopify apps even when they share source code.

## What is included

- Shopify embedded App Home built with React Router, App Bridge and Polaris web components
- Theme App Extension for inline and popup surveys, including desktop exit intent and mobile fallback triggers
- Checkout UI Extension for Thank you and Order status blocks
- Consent-aware Web Pixel Extension
- Public survey API with per-answer saves, resumable sessions and idempotent completion
- Seven Harbor templates in English, German and Spanish
- NPS, CSAT, purchase motivation, funnel, order correlation and CSV reporting
- Klaviyo event delivery, Flow webhook intake and weekly deterministic reporting
- Shopify percentage, fixed-amount and free-shipping rewards
- PostgreSQL/Prisma persistence and Graphile Worker jobs
- 24-month standard retention, 90-day contact retention and 30-day uninstall grace period

All placements are disabled by default. The Harbor purchase-motivation
placement is seeded at a 10% sample rate but still requires an explicit publish
and enable action.

## Local development

Requirements: Node.js 22, npm, PostgreSQL and a Shopify development app/store.

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed
npm run dev
```

For interface review without Shopify or PostgreSQL credentials, set
`DEMO_MODE=true` and run `npm run dev:web`; open `/demo` on the printed local
URL. Demo mode never bypasses authentication on `/app` or any production API.
On Windows, `pwsh -File scripts/start-demo.ps1` supplies isolated local demo
defaults and starts the same review surface at `http://127.0.0.1:3000/demo`.

## Verification

```bash
npm test
npm run test:extensions
npm run typecheck
npm run lint
npm run build
npm exec shopify app build -- --no-color
npm run test:e2e
```

## Deployment

Use one Railway project with PostgreSQL and two services from this repository:

- Web: uses `railway.toml`
- Worker: select `railway.worker.toml` as its config file

Set the variables in `.env.example`, deploy both services, point your chosen
domain to the web service, then update the Shopify Dev Dashboard URLs and
Klaviyo Flow webhook secrets. See [Deployment](docs/DEPLOYMENT.md) and
[Launch checklist](docs/LAUNCH-CHECKLIST.md).

After the one-time Shopify and Railway binding, production can be deployed from
the GitHub Actions **Deploy Shopoll** workflow. See
[GitHub one-click deployment](docs/GITHUB-DEPLOYMENT.md).

## Security and privacy

Customer names, email addresses, phone numbers and postal addresses are not
stored in ordinary survey, order or analytics records. Optional contact answers
require explicit consent and are encrypted separately. Invite tokens are
256-bit opaque values; only their hashes are stored. Queue payloads contain only
database IDs, and application logging redacts secrets and contact fields.

## Key documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API contracts](docs/API.md)
- [Klaviyo setup](docs/KLAVIYO.md)
- [Deployment](docs/DEPLOYMENT.md)
- [GitHub one-click deployment](docs/GITHUB-DEPLOYMENT.md)
- [Launch checklist](docs/LAUNCH-CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

[MIT](LICENSE) Copyright (c) 2026 Harbor Innovations.
