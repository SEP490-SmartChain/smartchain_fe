# pages/workspace

Trang trong workspace của tenant (sau ProtectedRoute): orders, inventory, rules,
shipments, reconciliation, dashboard, analytics, settings.

`/settings/profile` gộp thông tin cá nhân và thông tin cửa hàng trong một tab Hồ sơ.
Thông tin cửa hàng chỉ hiện với capability `workspace.settings.manage`; hai phần giữ
API và nút lưu riêng. URL cũ `/settings/general` giữ guard hiện hành và chuyển về Hồ sơ,
không xuất hiện thêm trong tab, sidebar hoặc tìm kiếm.

Avatar cá nhân dùng object key từ API cho cả seller và PLATFORM (`platform/users/...`). Sau khi
lưu thành công, session store cập nhật avatar để Hồ sơ và navbar đọc cùng dữ liệu. Ảnh vừa chọn
chỉ là preview cho tới khi nhấn Lưu ảnh thành công. Backend cần migration
`20261015130000_platform_profile_avatar` để lưu và khôi phục ảnh tài khoản PLATFORM.
