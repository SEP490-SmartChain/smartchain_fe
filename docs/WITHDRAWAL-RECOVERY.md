# Seller withdrawal recovery

Persist the immutable withdrawal command before sending it. Recovery uses tab-local
sessionStorage, keyed by the authenticated user and seller, independently of auth
revision or service suspension. It contains only command UUIDs, quantity and the
registered address version. Tokens and recipient/contact data are never stored.

A reload restores the same request and quantity. Retry remains available even when
the lot is no longer in the available-stock options: the server must replay durable
idempotency before checking current stock, address or financial admission again.
Successful replay returns the original order, clears only its stored reference and
resets selection/quantity before another request can be made.

HTTP 401/403/404/408/429, server/network failures and idempotency conflicts retain the
reference. These responses cannot establish whether an earlier attempt committed.
A definite business rejection permits correction. If recovery storage cannot be
written, the client sends no new withdrawal request. An unresolved reference cannot
be overwritten by a different UUID or payload. Do not clear a damaged recovery
record without checking order history first.

The reference survives reloads in this tab, not closing the tab or manually clearing
browser session data. Server-side idempotency remains authoritative. This does not
store or reuse credentials and never substitutes for server authorization.

Verification: `node --test tests/withdrawal-retry.test.mjs tests/withdrawal-pending.test.mjs`.
The API's disposable PostgreSQL/Redis integration suite separately verifies replay,
registered-address binding, named-lot availability and debt/contract gates.
