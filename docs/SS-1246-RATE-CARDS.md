# Sprint 4 rate-card UI

Source: Report3 UC-94/118/119, BR-53 và backend `docs/SS-1241-SS-1246-SPRINT4-HANDOFF.md`.

Admin: `/admin/carriers` tabs Catalogue / Accounts / Tariffs. Tariff-only page `/admin/tariffs` cho Admin/Accountant, không grant carrier credentials hoặc generic admin routes cho Accountant. Sidebar, search, guard/action lấy capability `tariffs.manage`.

Layout theo Archivo/Common/Tailwind tokens: title + reload/create, Purchase/Seller tabs, table service/zone or sell code/version/status/effective dates/weight-price bands/actions. Draft editor 2-column metadata, band fieldsets 3 columns; mobile thành một cột. Modal có scroll/focus/keyboard theo Common component hiện hành.

States: loading, empty, API failure/retry, validation theo field, mutation pending, conflict giữ local inputs, đọc current data và explicit replace local inputs; published price immutable; close effective window future-only/CAS prior end. Tất cả form RHF+Zod, VND decimal strings/BigInt display, UTC dates, labels vi/en. Không fake save/publish success.

Backend API `/v1/platform/tariffs` qua apiClient; arrays ở data, meta.pagination. Parse service/policy/bands/status/revision/dates/money trước dùng. Session revision thay đổi unmount manager và abort reads; không giữ price data dưới user mới.

Source template cho Figma: list + draft editor + publication confirmation + conflict + effective window close. Figma link/version chưa được cung cấp; file này mô tả implementation, không là bằng chứng SS-1247 hoàn tất trên Figma.

Tests `tests/freight-tariffs.test.mjs`: role/route privacy, malformed envelope/money, draft/publish/close contract, overlap/gap/reference cap/date, serialization. Sidebar regression được cập nhật vì Accountant nay có tariff-only entry theo UC-94/118.
