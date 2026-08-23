# stores

Store toàn cục viết bằng **Zustand**. Chỉ chứa state **dùng chung giữa nhiều
feature**: phiên đăng nhập, tenant đang chọn, quyền RBAC, ngôn ngữ, trạng thái
UI toàn cục.

State chỉ một feature dùng phải nằm trong store cục bộ của feature đó
(`src/features/<name>/`) — nếu không, `stores` sẽ phình thành nút phụ thuộc của
toàn bộ ứng dụng (FE dependency rule #5, SDD mục 1.2.1).
