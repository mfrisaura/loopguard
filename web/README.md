# LoopGuard web (dashboard + API + landing)

Next.js 16 (App Router) + Prisma 6 + Postgres + Stripe (test mode). Deployed on Railway at https://tryloopguard.com (redeploys when files in `web/` change on `main`).

## Run locally
```bash
cp .env.example .env            # fill DATABASE_URL; Stripe test keys optional
npm install && npx prisma db push
npm run build && npm start       # or npm run dev
```
Without `RESEND_API_KEY`, sign-in links and alert emails are printed to the server log (and shown on /login in `next dev`).

## Pieces
| Path | What |
|---|---|
| `/` | Landing page (tagline, features, pricing) |
| `/login`, `/api/auth/*` | Email magic-link auth (15-min one-time tokens, hashed; 30-day HttpOnly session cookie) |
| `/dashboard` | 30-day stacked per-agent cost chart (SVG), today/7d/30d totals, trips list, remote pause, API keys, alert settings, billing |
| `POST /api/sync` | CLI upload (Bearer `lg_…` API key). Strict allow-list: aggregate tokens/cost per hashed session/day/model + trips. Returns `pausedUntil` |
| `/api/pause` | Remote pause/resume (applied by CLI on next `loopguard sync`) |
| `lib/alerts.ts` | Channel abstraction: email (Resend), Slack + Discord webhooks; fan-out with per-channel failure isolation; webhook URL allow-list (SSRF guard) |
| `lib/stripe.ts` | Checkout (Pro $9/mo, $79/yr; Team $19/dev/mo min 3 seats), customer portal, signed + idempotent webhook → plan. Refuses non-test keys unless `ALLOW_LIVE_STRIPE=1` |

Paid features (sync, alerts, remote pause) = Pro/Team or 14-day trial from signup.

## Stripe webhook events to enable
`checkout.session.completed`, `customer.subscription.created|updated|deleted` → `POST /api/stripe/webhook`.

## Tests
`npm test` (needs Postgres at `DATABASE_URL`): auth, payload validation/privacy, alerts, sync route, trial gating, Stripe checkout + signed webhooks (no network), chart.
