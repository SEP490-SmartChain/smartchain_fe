# Kế hoạch chỉnh màn hình đăng nhập Google

## Mục tiêu

- Xác minh nút “Tiếp tục với Google” hiển thị và hoạt động trên `/login` khi môi trường bật Google.
- Bỏ mục thu gọn “Chọn cửa hàng (không bắt buộc)” và ô mã cửa hàng khỏi màn hình đăng nhập mặc định. Chỉ hiện ô mã khi API yêu cầu phân biệt nhiều cửa hàng.

## Hiện trạng đã kiểm tra

- [LoginForm](../src/features/auth/components/LoginForm.tsx) trong bộ thay đổi đang merge đã lắp `GoogleLoginFlow`. Commit hiện tại của `develop` chưa có phần lắp này. Git hiện đã ghi nhận cách xử lý xung đột ở `messages/vi.json`, và merge vẫn đang mở.
- Web lấy cấu hình từ `GET /api/v1/auth/google/config` qua [HTTP client hiện có](../src/features/google-oauth/runtime/http-google-oauth.client.ts). Google chỉ hiển thị khi cấu hình trả `enabled: true` và `clientId` có giá trị.
- Checkout backend local hiện tại chưa có route cấu hình Google. Ref `origin/develop` của backend đã có route và lấy Client ID từ `GOOGLE_OAUTH_CLIENT_ID`. File cấu hình backend local chưa khai báo giá trị này. Sandbox chặn lần gọi thử qua loopback, nên trạng thái của server đang chạy chưa được xác minh.

## Thay đổi dự kiến

1. Codex xác minh lại baseline từ bộ thay đổi đã tích hợp Google và kiểm tra endpoint cấu hình từ đúng URL mà web sử dụng. Phân biệt trường hợp API chưa có route, API trả Google đang tắt và API trả Google đã bật.
2. Giữ nút `GoogleLoginFlow` làm điểm vào Google trên `/login`. Dùng cấu hình công khai của backend và Google Identity Services hiện có. Nếu cấu hình hoặc SDK gặp lỗi, form email/mật khẩu vẫn dùng được.
3. Bỏ `<details>` và nhãn tùy chọn. Khi đăng nhập bằng mật khẩu hoặc Google nhận `409 AUTH.WORKSPACE_REQUIRED`, hiện ô mã cửa hàng cùng hướng dẫn thử lại theo phương thức vừa dùng. Ưu tiên focus vào ô mới để dùng được bằng bàn phím. Dùng validation và quy tắc chuẩn hóa mã hiện có cho cả hai lần thử lại. Lần thử đầu không gửi `workspaceSlug`.
4. Dùng bản dịch Việt/Anh cho hướng dẫn nhập mã. Google vẫn dùng kết quả xác thực hoặc onboarding từ server. Giữ cơ chế session, cookie và phân quyền hiện có.

## API và dữ liệu

- `GET /api/v1/auth/google/config` trả `{ enabled, clientId }` trong envelope hiện có.
- `POST /api/v1/auth/login` nhận `email`, `password`, `rememberSession` và `workspaceSlug` khi cần.
- `POST /api/v1/auth/google/login` nhận `idToken`, `rememberSession` và `workspaceSlug` khi cần. Khi thử lại, lấy credential qua luồng Google hiện có.
- `AUTH.WORKSPACE_REQUIRED` là tín hiệu hiện ô mã. Các lỗi `409` khác đi qua luồng lỗi thông thường. Phạm vi thay đổi là web `/login`, dùng chung backend contract hiện có và không cần migration.

## File và người phụ trách

- [LoginForm.tsx](../src/features/auth/components/LoginForm.tsx) cho UI và trạng thái yêu cầu nhập mã.
- [messages/vi.json](../messages/vi.json) và [messages/en.json](../messages/en.json) cho nội dung Việt/Anh.
- [tests/auth.test.mjs](../tests/auth.test.mjs) cho regression của request đăng nhập và mã lỗi.
- Codex phụ trách kiểm tra cấu hình, tích hợp và áp dụng bản vá sau khi phạm vi được duyệt. Codex reviewer kiểm tra diff và kết quả kiểm thử.

## Tiêu chí nghiệm thu

- Lần đầu mở `/login`, cụm chọn cửa hàng trong ảnh không xuất hiện, kể cả khi Google bị tắt. Email/mật khẩu và quên mật khẩu vẫn truy cập được.
- Khi API trả cấu hình hợp lệ, nút Google hiển thị và bấm được sau khi SDK sẵn sàng. Xác minh trên kích thước desktop và mobile. Kiểm tra login của một tài khoản Seller thử nghiệm trong môi trường có Google để xác nhận credential, session và điều hướng.
- Khi API trả đúng `AUTH.WORKSPACE_REQUIRED`, trường mã xuất hiện và mã hợp lệ đi vào lần thử lại bằng đúng phương thức đăng nhập. Lỗi `409` khác không hiện trường này.
- Chạy `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` và các test Google OAuth hiện có liên quan đến login/config.

## Rủi ro và hoàn tác

- Google thật yêu cầu backend có route, Client ID web của dự án và web origin tương ứng trong danh sách được phép. Có thể kiểm UI độc lập bằng phản hồi mô phỏng trong môi trường test. Chỉ đánh dấu đăng nhập Google thật đã xác minh sau khi thử thành công với cấu hình và tài khoản thử nghiệm.
- Merge song song có thể thay đổi baseline hoặc gây lỗi bản dịch. Xác minh lại trạng thái checkout ngay trước khi áp dụng và giữ các thay đổi hiện hữu.
- Hoàn tác bằng cách hoàn nguyên riêng bản vá login UI, bản dịch và regression test. Dữ liệu và session hiện có không cần chuyển đổi.

## Kết quả kiểm tra

- Bản vá được áp dụng trên `develop` sau khi merge frontend hoàn tất. Hai work order DeepSeek trả `fetch failed`. Codex viết bản vá và regression test, sau đó Codex reviewer xác minh bản sửa focus và thao tác dùng tài khoản Google khác.
- `npx tsc --noEmit`, `npm run format:check` và `git diff --check` đạt. `npm run lint` đạt với 0 lỗi và 30 cảnh báo ở file ngoài phạm vi. `npm run build` đạt với cảnh báo kích thước chunk của Vite.
- `npm test` đạt 1.570/1.570. Ba file spec Google về login, nút và HTTP client chạy qua Vite SSR đạt thêm 23/23.
- Chromium kiểm tra bundle `/login` trên desktop và mobile bằng SDK và API mô phỏng. Đã xác minh hiển thị nút Google theo cấu hình, focus đúng khi yêu cầu mã, luồng dùng tài khoản Google khác, bỏ qua `409` không liên quan và điều hướng sau lần đăng nhập lại bằng mã hợp lệ.
- Gọi `GET /api/v1/auth/google/config` đến backend local mà Vite trỏ đến trả `ECONNREFUSED`. Đăng nhập bằng tài khoản Google thật cần backend đang chạy với route này, Client ID và origin được cấu hình.
