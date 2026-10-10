# SS-971 — ORCA portals

Base: develop, theo xác nhận của người dùng. Nhánh: feat/SS-971-orca-portals.
Scope: S10 trong ORCA_Task_List.xlsx / SS-971 [FE], theo nội dung description. Nhãn [CODE][BE] trên các subtask Jira không khớp scope FE trong Excel. SS-977 xử lý API staff và warehouse assignment; SS-971 dùng auth contract hiện có, không thêm API hoặc migration.

- SS-972: WarehouseNavigation có touch target 48px, grid 2/4 cột, route/menu vẫn dùng policy trung tâm bảy role. PortalLayout chọn Seller / Warehouse / ORCA Operations từ scope và route hợp lệ. Seller Staff chỉ xem đơn/tồn kho và chuẩn bị ASN; không sửa SKU, vận hành đơn hoặc quản lý warehouse. Technical audit chỉ Admin; integration health chỉ Admin/Ops theo SRS UC152/154. Evidence nghiệp vụ không cấp quyền vào technical logs.
- SS-973: title/description HTML đổi ORCA; logo, auth, catalog i18n đã có ORCA trên develop. Không đổi package scope, cookie, storage key hoặc signature header kỹ thuật. Landing riêng: smartchain-landingpage, chưa có repo trong workspace.
- SS-974: mỗi màn kho có lazy route và file riêng dưới src/pages/warehouse: Inbound, Receiving, Putaway, Picking, Packing, Handover, Returns, Counts. Page lắp ghép feature qua public index khi nghiệp vụ được triển khai; hiện dùng UnderConstruction.
- SS-975: Plans, Quotas, ApiTraffic, Audit, Observability, Webhooks thay toàn bộ metrics/activity giả bằng UnderConstruction.
- SS-976: tests/access-policy.test.mjs kiểm tra bảy role, portal, redirect, route, sidebar/search và deny legacy/mixed scope. tests/auth.test.mjs kiểm tra API login → session → portal cho bảy role, và refresh profile Owner → Staff thu hồi route Owner mà không logout. Mock tại fetch boundary; đây là kiểm tra integration phía FE, không thay cho E2E với BE đang chạy. Không gọi các placeholder là nghiệp vụ hoàn tất.

Phân công feature: catalog — inbound/receiving/putaway; orders — picking/packing/handover; inventory — returns/counts. Giữ guard/router ở composition root.

Điểm ghép SS-977: giữ route `/admin/staff`, capability `iam.warehouses.assign`, nhóm menu `platform_staff_heading` và form staff từ nhánh SS-977. Không cấp warehouse assignment cho role ngoài Admin. Kiểm tra merge cả hai thứ tự và chạy typecheck, lint, format, tests, build trên cây code kết hợp trước khi merge vào develop.
