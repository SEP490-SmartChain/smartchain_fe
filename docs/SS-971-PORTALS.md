# SS-971 — ORCA portals

Base: develop, theo xác nhận của người dùng. Nhánh: feat/SS-971-orca-portals.

- SS-972: WarehouseNavigation có touch target 48px, grid 2/4 cột, route/menu vẫn dùng policy trung tâm bảy role. PortalLayout chọn Seller / Warehouse / ORCA Operations từ scope và route hợp lệ.
- SS-973: title/description HTML đổi ORCA; logo, auth, catalog i18n đã có ORCA trên develop. Không đổi package scope, cookie, storage key hoặc signature header kỹ thuật. Landing riêng: smartchain-landingpage, chưa có repo trong workspace.
- SS-974: mỗi màn kho có lazy route và file riêng dưới src/pages/warehouse: Inbound, Receiving, Putaway, Picking, Packing, Handover, Returns, Counts. Page lắp ghép feature qua public index khi nghiệp vụ được triển khai; hiện dùng UnderConstruction.
- SS-975: Plans, Quotas, ApiTraffic, Audit, Observability, Webhooks thay toàn bộ metrics/activity giả bằng UnderConstruction.
- SS-976: tests/access-policy.test.mjs kiểm tra bảy role, portal, redirect, route, sidebar/search và deny legacy/mixed scope; không gọi các placeholder là nghiệp vụ hoàn tất.

Phân công feature: catalog — inbound/receiving/putaway; orders — picking/packing/handover; inventory — returns/counts. Giữ guard/router ở composition root.
