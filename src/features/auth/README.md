# features/auth

Đăng nhập, đăng xuất, refresh token, đăng ký tenant, xác thực email. BE: `iam`. SRS: FE-01.

## System Login + JWT (SS-336 / SS-338 / SS-339, SPA integration SS-340)

- `POST /api/v1/auth/login`: email, password, rememberSession, workspaceSlug (optional).
- `POST /api/v1/auth/refresh`: empty JSON body; cookie sent with `credentials: include`.
- `GET /api/v1/auth/me`: Bearer access token; `useAuth().refreshUser()` updates identity and grants.
- `POST /api/v1/auth/logout`: revokes the server session and clears the HttpOnly cookie.

The API success envelope is retained for existing registration/OTP consumers. Login and refresh
read `data.accessToken`, `data.expiresIn`, and `data.user` (userId, tenantId, email, fullName,
roles, permissions). Access tokens live only in Zustand memory. Reload restores the session
from the server cookie; rememberSession controls its browser lifetime. Legacy admin_token and
admin_session are no longer used. A network outage during restoration offers a retry.

Protected calls attach a Bearer token, refresh before expiry or once on 401, and share an
in-flight refresh within a tab. Public 401s remain form errors; permission 403s do not log out.
Logout waits for pending refresh and prevents new rotations until revocation completes. Failed
logout keeps the session visible so the user can retry. Tenant context and permissions come
from the verified profile, never a client-supplied tenant header.

Portal redirects use the verified roles through `accessPolicy.ts`: Admin lands on
`/admin/tenants`, Ops on `/shipments`, Warehouse Manager/Staff on `/warehouse/inbound`,
Accountant on `/reconciliation`, and Seller Owner/Staff on `/dashboard`. Protected redirects
preserve only an allowed internal destination. Missing, legacy or mixed-scope roles fail closed.
Menus, search and routes share the same policy; the API remains responsible for enforcing
permissions. Workspace slug can disambiguate shared emails.

Run `npm test` for contract, validation, session restoration, concurrent refresh, logout,
permission and redirect regression tests. Tests use Node's test runner and Vite's module loader;
only the fetch boundary is mocked. No additional test dependency is required.

Local integration: Vite proxies /api to VITE_API_TARGET; BE AUTH_WEB_ORIGIN must exactly match
http://localhost:2324 (or the actual FE origin). BE NODE_ENV=development permits HTTP cookies.
Production requires HTTPS, a same-site API, and preferably a reverse proxy retaining /api.
The refresh cookie is SameSite=Strict and scoped to /api/v1/auth; unrelated-site API URLs will
not support refresh.

## Business tax ID lookup during registration

The optional lookup button calls VietQR's public `/v2/business/:taxCode` endpoint directly from
the browser through `apiClient.lookupBusinessTaxId`. This request uses `credentials: omit` and
never includes a SmartChain Bearer token. It fills only the company name; the returned address
is shown for reference because the registration API does not currently persist an address.
Lookup failure never blocks manual registration. Do not automatically call on every keystroke:
the provider rate-limits requests. VietQR states this endpoint will stop on 2027-03-01, so
replace the provider before then; Xinvoice's successor API requires server-held credentials.

## Password Reset Request (SS-346)

`POST /api/v1/auth/password-reset-requests`: `{ email }`, anonymous (`requiresAuth: false`).
`ForgotPasswordForm` (`/forgot-password`) always renders the same generic "check your inbox"
confirmation after a successful call — the API never reveals whether the email belongs to an
eligible account, so the UI must not either. Errors (429 rate limit, 503 unavailable, network)
surface through apiClient's default toast; the form simply stays on the input step so the user
can retry. The email carries a one-time link, not an OTP code — do not route this flow through
`/otp`, which belongs to registration's email-verification step.

## Password Reset Confirmation

- `GET /api/v1/auth/verify-reset-token?token=...`: anonymous, read-only pre-flight check.
  `ResetPasswordForm` (`/reset-password`) calls this on mount with the one-time `token` read from
  the URL fragment (`#token=...`, never a query string in the address bar) via
  `usePasswordResetConfirm` — a missing fragment shows the invalid-link state without ever calling
  the API. While the check is pending the form shows a brief "checking link" state.
- `POST /api/v1/auth/reset-password`: `{ token, newPassword, confirmNewPassword }`, anonymous
  (`requiresAuth: false`). The server re-validates `newPassword === confirmNewPassword` and that
  the new password differs from the current one; the client-side Zod schema already enforces both,
  so these should not normally fire through the UI.

On success the form shows a generic "password reset" confirmation and links back to `/login`; the
API does not return session tokens, so the user signs in again with the new password (all of that
account's other sessions were revoked server-side). Any API error whose code is
`AUTH.PASSWORD_RESET_TOKEN_INVALID` — covering unknown, expired, already-used, or no-longer-eligible
tokens alike — switches the form to the same invalid-link state with a link to `/forgot-password`;
other errors (same-as-current password, rate limit, network) surface through apiClient's default
toast and leave the form on the input step for retry.
