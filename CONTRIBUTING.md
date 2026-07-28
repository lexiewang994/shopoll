# Contributing to Shopoll

Thank you for improving Shopoll.

## Local setup

Use Node.js 22, PostgreSQL and a Shopify development app/store. Copy
`.env.example` to `.env`, fill only local development credentials, then run:

```bash
npm ci
npx prisma migrate dev
npm run dev
```

For UI-only work, use `pwsh -File scripts/start-demo.ps1` on Windows and open
the local `/demo` route.

## Before opening a pull request

Run the relevant checks:

```bash
npm test
npm run test:extensions
npm run typecheck
npm run lint
npm run build
```

Keep changes scoped. Add or update tests for behavior changes, and explain any
privacy, Shopify scope or migration impact in the pull request.

## Security and privacy

Never commit credentials, store exports, customer data, real survey answers,
Shopify access tokens, Klaviyo keys or Railway tokens. Use synthetic fixtures
only. Report security issues through the process in [SECURITY.md](SECURITY.md),
not in a public issue.
