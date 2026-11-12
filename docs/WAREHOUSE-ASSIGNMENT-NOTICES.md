# Warehouse assignment notices

The top-bar bell shows authenticated Manager, Warehouse Staff and Ops their current
warehouse assignments, with a browser-local acknowledgement for each warehouse ID.
It uses the server-owned profile `warehouseIds`; it never changes a grant or infers
access from a notification, selected filter or browser storage.

The profile refreshes on focus and every 30 seconds while the page is visible. An
unchanged validated profile preserves its object identity so open forms are not reset.
Actual scope changes still invalidate scoped reads and drafts through the auth store.
Revoked assignments are removed; a subsequently observed regrant becomes unread again.
No credentials or product/customer data are stored in acknowledgement state.

These notices describe current grants, including existing grants on first use. They
are not a server event history, email delivery or cross-device read receipts. Browser
storage failure does not block the application. Refresh failure remains visible and
retryable; it is not shown as an empty assignment list.

The old decorative sample notification entries have been replaced with this real
profile-derived notice. Other notification channels retain their existing workflows.

Regression: `node --test tests/manual-feedback.test.mjs tests/auth.test.mjs`.
Visual fixture: `node tests/manual-feedback-browser.mjs` at loopback port 24606;
it uses only synthetic transport, with no environment file, shared database or provider.
