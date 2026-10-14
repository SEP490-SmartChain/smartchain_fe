# SS-985 — Frontend scope isolation

Source: ORCA Report 3 §2.1/§4.1, BR-01/41, NFR-12 and the existing
`GET /v1/auth/me`/login/refresh profile contract. DB RLS remains a backend gate.
No new screen, client tenant header or authorization endpoint is introduced.

FE retains validated `warehouseIds` from the server profile. Identity, actor scope,
seller, roles, permissions or assignments changing increments the auth revision.
Protected route content remounts to drop feature state; authenticated responses
from an older revision cannot enter the new view/cache, including delayed JSON
bodies and requests waiting for a 401 refresh. Public requests keep their existing
behavior. Same-scope token rotation/profile editing does not reset feature state.

Warehouse selection is a filter, not a grant. Current assignments come from
`/auth/me` or refresh; no push/polling contract is added. Remote revoke is enforced
by the backend on the next request. 403 does not refresh/logout the user.
UUID validation accepts PostgreSQL seed UUIDs without requiring RFC version bits.

Validation: `node --test tests/auth.test.mjs`, then `npx tsc --noEmit`,
`npm run lint`, `npm run format:check`, `npm test`, `npm run build`.
The existing seven-role/route policy tests remain in the full suite.
Business field projection/privacy acceptance beyond these scope lifecycle changes
belongs to the relevant API feature and SS-1302; hiding fields is not RLS proof.

Local verification (2026-10-11): auth tests 47/47 and the full FE suite 174/174
passed. TypeScript, Vite build and lint passed (lint retains existing warnings).
Changed files passed formatting and lint. Repository-wide formatting remains
blocked by existing style issues (34 files when checkout line endings are
normalized) and Windows CRLF checkout differences; unrelated content was preserved.
Both late-401 and pending-refresh revision mismatches now use
`AUTH.SCOPE_CHANGED` (status 0). Regression tests assert no toast, retry or
overwrite of the current identity/token. Hosted CI was not run.

Browser smoke used the real local API with restricted `app_user`, fresh ORCA
migrations/bootstrap and synthetic fixtures in a separate disposable PostgreSQL
15 container. No project database was queried or migrated. Verified:

- Seller 1 inventory contains only `ORCA-S1-*`; logging out and into Seller 2
  replaces it with only `ORCA-S2-*`.
- Seller direct navigation to `/admin/staff` reaches 403 and retains the session.
- Warehouse Manager can select an assigned warehouse and view multiple sellers.
- Revoking the manager's ORCA-DN assignment in the disposable fixture makes the
  next filtered request fail and removes the old table without logout. Reload
  refreshes the session and removes ORCA-DN from the warehouse selector. The
  assignment was restored after this check.

These browser checks cover read/scope flows; delayed-response races are covered
by automated tests. They do not certify every feature or all field projections.

Local UI handoff: `http://127.0.0.1:2324/inventory`, API on port 3000. Demo users
`owner1@orca.test`, `owner2@orca.test`, `manager@orca.test` share fixture password
`Demo@123456`. Manager must select a warehouse. PostgreSQL is bound to loopback
55485 (256 MB container limit), Redis to 56385 (64 MB); both containers carry
`orca.ss985.disposable=1`. FE/API each use a 512 MB Node heap limit. No worker,
MongoDB, SMTP, object storage or carrier service was started for this smoke.

For subsequent checks on this memory-constrained machine, set
`NODE_OPTIONS=--max-old-space-size=512` (768 for build) and run each command sequentially, with
no simultaneous backend build/test. This limits Node heap, not total system RAM.
