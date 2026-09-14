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

SUPER_ADMIN lands on /admin/tenants; workspace users land on /dashboard. Protected redirects
preserve an allowed internal destination. Admin menus and routes require SUPER_ADMIN; the API
remains responsible for enforcing permissions. Workspace slug can disambiguate shared emails.

Run `npm test` for contract, validation, session restoration, concurrent refresh, logout,
permission and redirect regression tests. Tests use Node's test runner and Vite's module loader;
only the fetch boundary is mocked. No additional test dependency is required.

Local integration: Vite proxies /api to VITE_API_TARGET; BE AUTH_WEB_ORIGIN must exactly match
http://localhost:2324 (or the actual FE origin). BE NODE_ENV=development permits HTTP cookies.
Production requires HTTPS, a same-site API, and preferably a reverse proxy retaining /api.
The refresh cookie is SameSite=Strict and scoped to /api/v1/auth; unrelated-site API URLs will
not support refresh.

## Password Reset Request (SS-346)

`POST /api/v1/auth/password-reset-requests`: `{ email }`, anonymous (`requiresAuth: false`).
`ForgotPasswordForm` (`/forgot-password`) always renders the same generic "check your inbox"
confirmation after a successful call — the API never reveals whether the email belongs to an
eligible account, so the UI must not either. Errors (429 rate limit, 503 unavailable, network)
surface through apiClient's default toast; the form simply stays on the input step so the user
can retry. The email carries a one-time link, not an OTP code — do not route this flow through
`/otp`, which belongs to registration's email-verification step. Token consumption (the
`/reset-password` confirmation page) is a separate, not-yet-implemented story.
