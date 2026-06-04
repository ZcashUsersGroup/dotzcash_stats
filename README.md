# dotzcash_stats

Standalone TypeScript stats engine for ZcashNames referral analytics.

## What this repo contains

- Supabase adapter for `public.zn_waitlist`
- Referral graph and reward logic
- Daily and weekly ranking builders
- Leaderboard, streak, time-series, and shareworthy-stat aggregators
- Pure Node tests

## Required environment

Copy `.env.example` into `.env` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Required waitlist columns

- `name`
- `referral_code`
- `human_referral_code`
- `referred_by`
- `created_at`
- `email_verified`
- `cabal`

## Scripts

- `npm test`
- `npm run build`

## Entry points

- [`src/index.ts`](./src/index.ts)
- [`src/lib/leaders/shareworthy-stats.ts`](./src/lib/leaders/shareworthy-stats.ts)

## Example

```ts
import { createDbClient, fetchAllWaitlistRows, toWaitlistReferralRows, buildShareworthyStatsSnapshot } from "./src/index.js";

const db = createDbClient();
const rawRows = await fetchAllWaitlistRows(db);
const rows = toWaitlistReferralRows(rawRows);
const snapshot = buildShareworthyStatsSnapshot(rows, "all");

console.log(snapshot);
```
