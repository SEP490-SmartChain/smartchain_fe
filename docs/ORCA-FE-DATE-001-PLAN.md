# ORCA-FE-DATE-001 · Kiểm tra ngày và giờ trên frontend

| Mục                  | Giá trị                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Dự án                | ORCA · Web nghiệp vụ                                                                              |
| Repo                 | `SEP490-SmartChain/smartchain_fe`                                                                 |
| Checkout             | `/Users/vtafi/Project/University/smartchain_fe`, `develop` tại `c516c3c`                          |
| Source API đối chiếu | `smartchain_be`, `develop` tại `76e00d3a`                                                         |
| Thay đổi có sẵn      | Checkout FE đã có thay đổi ở form ASN, lấy hàng, hợp đồng, hóa đơn, hai tệp i18n và các tệp khác. |
| Trạng thái           | Hoàn thành · 26/11/2026, giờ Việt Nam                                                             |
| Tiến độ              | 5/5 mốc · đạt kiểm thử, Chromium, review và kiểm tra toàn FE                                      |
| Bước tiếp theo       | Đã lưu bằng chứng kiểm tra định dạng toàn FE sau khi sửa realtime.                                |

## Mục tiêu

Phát hiện ngày không tồn tại, khoảng ngày bị đảo và mốc thời gian vượt giới hạn nghiệp vụ ngay tại trường nhập. Chặn thao tác dùng dữ liệu sai trước khi gọi API. Người dùng có thể sửa giá trị đang nhập và thử lại ngay.

## Hành vi đã xác minh

- Form ASN kiểm tra ETA bằng `Date.parse`, còn ngày hết hạn khai báo đã dùng `z.iso.date()`. API nhận ETA tùy chọn, hỗ trợ xóa bằng `null` khi sửa bản nháp và quyết định khả năng tiếp nhận dựa trên lịch kho. Hợp đồng hiện hành chưa quy định ngày hết hạn khai báo phải sau ETA hoặc đặt cận dưới theo thời điểm hiện tại cho ETA. [Hợp đồng ASN](../../smartchain_be/docs/SS-1063-ASN.md), [Kiểm tra tiếp nhận](../../smartchain_be/packages/inventory/src/lib/repositories/prisma-asn.repository.ts).
- API kiểm nhận hàng và xác nhận gợi ý từ ảnh đều dùng ngày hiện tại theo múi giờ kho để đối chiếu ngày sản xuất. Hạn dùng bằng hoặc trước ngày nhận vẫn có thể được ghi nhận để cách ly. Schema kiểm hàng trên FE đã kiểm tra thứ tự ngày, còn thiếu giới hạn ngày sản xuất. Form xác nhận từ ảnh hiện kiểm định dạng từng ngày. [Quy tắc lô hàng](../../smartchain_be/packages/inventory/src/lib/domain/receipt-count.ts), [Luồng kiểm nhận](../../smartchain_be/packages/inventory/src/lib/services/receipt-count.service.ts), [Luồng xác nhận từ ảnh](../../smartchain_be/packages/inventory/src/lib/services/receipt-packaging-ai.service.ts).
- FE đã có kiểm tra khoảng ngày ở một số bộ lọc, nhưng báo cáo còn dựa vào regex và `Date.parse`, bộ lọc nhân sự thiếu thông báo khi đảo khoảng, và form kiểm kê mới kiểm tra có đủ hai đầu mốc trước khi chuyển ISO. API báo cáo và webhook dùng chung quy tắc 92 ngày, tính cả hai đầu, trong khoảng năm 2000–2100. API lập đợt lấy hàng và xem trước giới hạn mốc chốt trong 7 ngày tính đến thời điểm hiện tại. [Khoảng báo cáo](../../smartchain_be/packages/platform/src/lib/domain/report-range.ts), [Kiểm kê](../../smartchain_be/packages/inventory/src/lib/services/inventory-workflow.service.ts), [Mốc lấy hàng](../../smartchain_be/packages/allocation/src/lib/services/picking.service.ts).
- Form lập bảng kê COD theo yêu cầu có `max` trên ô ngày và dùng `noValidate`. Schema hiện mới kiểm thứ tự ngày. API yêu cầu khoảng thời gian dương, tối đa 92 ngày và kết thúc chậm nhất là lúc hiện tại. API đóng kỳ hóa đơn chỉ nhận tháng nghiệp vụ đã kết thúc. API ghi nhận tiền thực tế và chuyển khoản từ chối mốc tương lai. [Bảng kê theo yêu cầu](../../smartchain_be/packages/billing/src/lib/services/on-demand-payout.service.ts), [Đóng kỳ hóa đơn](../../smartchain_be/packages/billing/src/lib/services/monthly-invoice.service.ts), [Biên nhận ngân hàng](../../smartchain_be/packages/billing/src/lib/services/bank-receipt.service.ts), [Đối soát chuyển tiền](../../smartchain_be/packages/db/prisma/migrations/20261122090000_recon_verified_weekly_payout/migration.sql).

## Quy tắc đã duyệt

Ngày 26/11/2026, người dùng xác nhận triển khai phạm vi trong kế hoạch.

| Luồng                            | Quy tắc và cách xử lý                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASN                              | Kiểm tra ngày giờ ETA và ngày hết hạn khai báo đúng theo lịch. ETA và ngày hết hạn vẫn tùy chọn theo hợp đồng và cấu hình SKU. Kho tiếp tục xác định lịch tiếp nhận. Cần quyết định nghiệp vụ riêng nếu muốn chặn ETA trong quá khứ hoặc hạn dùng trước ETA.                                                     |
| Kiểm nhận và xác nhận từ ảnh     | Ngày sản xuất tối đa là hôm nay theo giờ Việt Nam. Hạn dùng phải sau ngày sản xuất khi có cả hai. Hàng hết hạn vẫn nhập được ngày in trên bao bì để đi qua luồng cách ly. Giữ quy tắc bắt buộc theo SKU và cách suy ra hạn dùng từ thời hạn bảo quản.                                                            |
| Lịch kho và kiểm kê              | Ngày giờ nhập phải tồn tại. Khoảng dừng kho cần đủ hai mốc, kết thúc sau bắt đầu. Cửa sổ kiểm kê được để trống cả hai, hoặc điền cả hai với kết thúc sau bắt đầu. Ngày giờ tra lịch kho dùng giờ Việt Nam và cho phép tra ngày dự kiến.                                                                          |
| Lập đợt lấy hàng                 | Mốc chốt nằm trong 7 ngày vừa qua, đến thời điểm hiện tại. Áp dụng lúc xem trước và lúc gửi tạo đợt. Tính giới hạn theo đồng hồ tại thời điểm thao tác.                                                                                                                                                          |
| Bộ lọc ngày                      | Ngày tồn tại và từ ngày ≤ đến ngày. Giữ bộ lọc một đầu ở Đơn hàng, Tồn kho và Nhân sự. Báo cáo và Webhook cần hai ngày hợp lệ, tối đa 92 ngày tính cả hai đầu, trong năm 2000–2100. Giữ điểm bắt đầu/kết thúc và cách diễn giải múi giờ của mỗi bộ lọc; bộ lọc nhân sự tính trọn ngày cuối theo giờ trình duyệt. |
| COD theo yêu cầu                 | Dùng ngày nghiệp vụ Việt Nam, cả hai ngày tối đa là hôm nay. Được chọn cùng ngày nếu đã có một khoảng thời gian dương. Khoảng gửi API không dài hơn 92 ngày, được chốt đến thời điểm hiện tại nếu ngày kết thúc là hôm nay.                                                                                      |
| Biên nhận, đối soát và hoàn tiền | Mốc ghi nhận tiền thực tế phải hợp lệ và tối đa là hiện tại. Khi trả COD, so thêm với thời điểm duyệt và cửa sổ của bảng kê tuần dựa trên dữ liệu sẵn có. Hoàn tiền khi đóng hợp đồng dùng ngay giới hạn tương lai ở FE, còn mốc yêu cầu đóng hợp đồng được API kiểm tra theo hồ sơ.                             |
| Hóa đơn và hợp đồng              | Chỉ đóng kỳ với tháng đã kết thúc theo giờ Việt Nam, trong phạm vi tháng BE hỗ trợ. Ô ngày hiệu lực của gói và hợp đồng tùy chỉnh yêu cầu ngày có thật, vẫn cho phép lập lịch hiệu lực theo hợp đồng hiện hành.                                                                                                  |

Rà hồi quy các chỗ đã kiểm ngày theo lịch gồm ngày nghỉ kho, biểu phí dịch vụ và ngày giả lập. Mỗi tính năng tiếp tục dùng hợp đồng riêng cho giờ làm việc, hiệu lực biểu phí, ngày giả lập và bộ lọc tháng hóa đơn.

## Triển khai và hợp đồng dữ liệu

- Dùng Zod tại ranh giới gửi form và dùng `Input` sẵn có cho phản hồi tại trường nhập, với nội dung tiếng Việt và tiếng Anh. `min`/`max` hỗ trợ thao tác chọn ngày. Form, nút xem trước và bộ lọc tự tải cần kiểm tra lại dữ liệu trước khi gọi API hoặc chuyển sang ISO, kể cả khi trình duyệt đã hỗ trợ ràng buộc nhập liệu.
- Tái sử dụng `z.iso.date()` cho ngày lịch. Tạo tiện ích dùng chung ở `src/lib/dateValidation.ts` cho ngày Việt Nam và phân tích `datetime-local` theo múi giờ của từng luồng. Kiểm tra ngày giờ nhập có thể chuyển về đúng các thành phần ban đầu để bắt cả trường hợp JavaScript tự dời một ngày hoặc một giờ không tồn tại. Quy tắc nghiệp vụ đặt ở feature tương ứng; dùng thời điểm cố định khi kiểm thử các giới hạn dựa vào đồng hồ.
- Ngày lịch giữ dạng `YYYY-MM-DD`, tháng giữ `YYYY-MM` và thời điểm gửi API giữ ISO 8601 theo cách chuyển đang dùng của từng luồng. Giữ sự khác biệt giữa giá trị bỏ trống, dữ liệu không hợp lệ và thao tác xóa ETA có chủ đích. Đối với giá trị chỉ chính xác đến phút, phải xử lý đúng biên có giây. Dùng đồng hồ máy khách như phản hồi sớm, còn thời gian máy chủ và dữ liệu nghiệp vụ từ API quyết định kết quả cuối cùng.
- Phạm vi checkout triển khai là FE, với endpoint, DTO, quyền, mã lỗi và cơ chế retry hiện hành. Lỗi máy chủ tiếp tục hiển thị qua cơ chế của từng luồng.

## File và người phụ trách

Codex Master sở hữu toàn bộ thay đổi, gồm tiện ích dùng chung và hai tệp i18n. Codex Quality Reviewer đọc diff và kiểm tra bằng chứng độc lập sau triển khai. Các đường dẫn dưới đây tương đối từ repo FE.

| Nhóm                 | File dự kiến                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dùng chung           | `src/lib/dateValidation.ts`, `messages/vi.json`, `messages/en.json`                                                                                                                                                                                                                                                                                                                 |
| Nhập kho             | `src/features/inbound/components/{AsnForm,ReceiptCountForm,ReceiptPackagingPanel}.tsx`, `src/features/inbound/schemas/{asnSchema,receiptCountSchema}.ts`, `src/features/inbound/api/packagingAiApi.ts`                                                                                                                                                                              |
| Lịch và kiểm kê      | `src/features/catalog/components/{WarehouseCalendarPanel,WarehouseDowntimePanel}.tsx`, `src/features/inventory/components/InventoryWorkflowAction.tsx`                                                                                                                                                                                                                              |
| Đơn hàng và lấy hàng | `src/features/orders/components/{SellerOrders,PickingWorkspace}.tsx`, `src/features/orders/schemas/pickingSchema.ts`                                                                                                                                                                                                                                                                |
| Báo cáo và bộ lọc    | `src/features/analytics/components/{ReportWorkspace,WebhookDeliveryWorkspace}.tsx`, `src/features/analytics/schemas/reportSchema.ts`, `src/features/analytics/api/webhookReportApi.ts`, `src/features/inventory/components/InventoryDetailPanel.tsx`, `src/features/tenants/components/StaffAccountDirectory.tsx`                                                                   |
| Tài chính            | `src/features/tenants/components/{OnDemandStatementForm,BankReceiptForm,PayoutStatementDetail,CloseoutSettlement,FulfillmentBilling,CommercialPlanAdmin,TenantContractTab}.tsx`, `src/features/tenants/schemas/{payoutSchema,invoiceSchema}.ts`, `src/features/reconciliation/components/SettlementRemittancesModal.tsx`, `src/features/reconciliation/schemas/remittanceSchema.ts` |
| Kiểm thử và theo dõi | `tests/date-validation.test.mjs`, `tests/receipt-date-validation-browser.mjs`, `tests/picking-user-review.test.mjs`, `tests/ledger-fee-labels.test.mjs` và `docs/ORCA-FE-DATE-001-PLAN.md`                                                                                                                                                                                          |

## Nghiệm thu và kiểm thử

1. **Đối chiếu luồng và hợp đồng.** Đã xác minh quy tắc ở các nguồn trên. Đọc lại diff của những tệp đang có sửa đổi trước khi tích hợp.
2. **Kiểm ngày lịch, thời điểm và khoảng.** Dùng test Node với đồng hồ cố định cho 29/02 năm nhuận, 29/02 năm thường, 31/04, ngày giờ ngoài lịch, giờ nhảy do DST với trường dùng giờ trình duyệt, khoảng đảo, hai đầu cùng ngày và trường để trống. Đối chiếu `Asia/Ho_Chi_Minh` và `America/Los_Angeles` quanh nửa đêm Việt Nam. Thử đúng biên và vượt biên 7 ngày, 92 ngày, tháng đã kết thúc, ngày sản xuất và ngày chuyển tiền trong tương lai.
3. **Xác nhận khi thao tác trên web.** Dùng fixture cục bộ và theo dõi request. Thử ít nhất một form ghi dữ liệu, một bộ lọc và nút xem trước lấy hàng. Trường sai phải hiện lỗi sát ô, giữ dữ liệu và không phát request. Sửa đúng phải cho phép thao tác với payload tương thích. Kiểm thêm ASN được xóa ETA, lô hết hạn vẫn gửi được ngày thực tế và dữ liệu tiếng Việt/Anh cho các lỗi chính.
4. **Chạy kiểm tra dự án.** `node --test tests/date-validation.test.mjs tests/picking-user-review.test.mjs tests/ledger-fee-labels.test.mjs tests/asn-api.test.mjs tests/receiving-api.test.mjs tests/receiving-packaging-ai.test.mjs tests/warehouse-calendar.test.mjs tests/sprint7-cycle-count.test.mjs tests/report-workspace.test.mjs tests/seller-orders.test.mjs tests/picking.test.mjs tests/payout-on-demand.test.mjs tests/recon-money.test.mjs tests/invoice-billing.test.mjs`, sau đó `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` và `git diff --check`. Ghi kết quả thực tế của từng lệnh.
5. **Review độc lập.** Reviewer đối chiếu kết quả với nguồn quy tắc, các chỗ chuyển múi giờ, xử lý giá trị của bản nháp cũ, quyền hiện hữu và việc chặn request sai. Sửa phát hiện thuộc phạm vi rồi chạy lại kiểm tra liên quan.

## Rủi ro và hoàn tác

- Phân biệt ngày lịch với thời điểm có múi giờ để tránh lệch ngày khi trình duyệt đặt ngoài Việt Nam. Giữ phép so sánh ngày nhận và ngày đóng kỳ theo lịch nghiệp vụ. Xác minh lại giờ kho và các đường chuyển ISO bằng fixture.
- Các tệp đang có diff cần ghép theo từng đoạn. Nếu quality gate báo lỗi, đối chiếu với baseline trước khi quy lỗi cho task. Khi hoàn tác, gỡ các đoạn thuộc task và các kiểm thử tương ứng để giữ phần thay đổi khác trong checkout.

## Bằng chứng ngày 26/11/2026

| Kiểm tra                                         | Kết quả                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test Node theo phạm vi ở mốc 4                   | 245/245 đạt. Bao gồm ngày nhuận, ngày không tồn tại, giờ bị bỏ qua do DST, khoảng ngày, các biên 7 và 92 ngày, ngày Việt Nam lúc chuyển ngày và biên đến giây.                                                                                             |
| `npm test`                                       | 1.672/1.672 đạt, 0 lỗi và 0 bỏ qua.                                                                                                                                                                                                                        |
| `npx tsc --noEmit`                               | Đạt.                                                                                                                                                                                                                                                       |
| `npm run lint`                                   | Đạt, 0 lỗi và 39 cảnh báo ở các tệp ngoài thay đổi ngày giờ.                                                                                                                                                                                               |
| `npm run build`                                  | Đạt. Vite cảnh báo một số bundle lớn hơn ngưỡng 500 kB.                                                                                                                                                                                                    |
| `node tests/receipt-date-validation-browser.mjs` | Chromium đạt cả 5 luồng với fixture cục bộ. Đã quan sát trường lỗi và số request khi nhập sai, dữ liệu khi sửa đúng, cùng key và body ở lần retry COD.                                                                                                     |
| Prettier theo phạm vi và `git diff --check`      | Đạt. Hai tệp i18n parse thành công và có cùng 13 khóa báo lỗi ngày giờ.                                                                                                                                                                                    |
| `npm run format:check`                           | Còn lỗi định dạng ở [contracts.ts](../src/features/realtime-notifications/shared/contracts.ts) và [test-fixtures.ts](../src/features/realtime-notifications/shared/test-fixtures.ts). `git diff --exit-code HEAD` xác nhận hai tệp có nội dung trùng HEAD. |
| Review độc lập                                   | Reviewer chạy lại test Node theo phạm vi review, đạt 17/17, và Chromium, đạt 5/5 luồng. Phát hiện về độ chính xác đến giây của chuyển COD đã được xử lý và kiểm lại. Reviewer xác nhận hai tệp đang chặn Prettier trùng HEAD.                              |

Chromium chạy với `PLAYWRIGHT_MODULE` trỏ tới module Playwright cục bộ và `CHROMIUM_EXECUTABLE` trỏ tới trình duyệt đã cài. Fixture khởi động Vite trên `127.0.0.1:24367` và tạo phản hồi API giả lập cho năm luồng.

- ASN trong múi giờ Los Angeles chặn giờ không tồn tại, giữ nguyên chính xác ETA đã lưu khi trường ngày không đổi, gửi `null` khi xóa ETA và giữ ngày hết hạn khai báo.
- Webhook báo lỗi tiếng Anh cho khoảng đảo, giữ số lượt truy vấn và gửi đúng hai đầu ngày sau khi sửa.
- Xem trước lấy hàng bỏ qua hai giá trị ngoài cửa sổ và gửi đúng timestamp ở biên 7 ngày.
- COD từ chối kỳ kết thúc trong tương lai. Retry sau khi đồng hồ tiến thêm 5 phút gửi lại đúng khóa và payload ban đầu.
- Chuyển COD chặn thời điểm trước lúc duyệt 1 giây và gửi đúng mốc được duyệt khi nhập chính xác đến giây.

## Xác nhận lại kiểm tra toàn FE ngày 26/11/2026

Đã xử lý hai lỗi định dạng realtime tồn tại ở lượt triển khai. `npm run format:check`, TypeScript, lint, build và `git diff --check` đạt. Toàn bộ 1.678 test thuộc `npm test` và 5 luồng Chromium ngày giờ đạt. [Bằng chứng lượt kiểm tra toàn FE](./ORCA-FE-VOLUME-001-PLAN.md#kiểm-tra-sau-khi-sửa-lint-và-định-dạng-ngày-26112026).
