import {
  interpolateNotificationTemplate,
  type InAppNotificationDto,
  type RealtimeCategory,
  type RealtimeParams,
} from '../../shared';

export type NotificationTranslator = (key: string, values?: RealtimeParams) => string;

export interface FormattedNotificationText {
  readonly title: string;
  readonly body: string;
}

interface NotificationTemplatePair {
  readonly title: string;
  readonly body: string;
}

const NOTIFICATIONS_PREFIX = 'Notifications.';

const CATEGORY_FALLBACK_TITLES: Readonly<Record<RealtimeCategory, string>> = {
  INBOUND: 'Thông báo nhập kho',
  OUTBOUND: 'Thông báo xuất kho',
  SHIPMENT: 'Thông báo vận đơn',
  INVENTORY: 'Thông báo tồn kho',
  ORDER: 'Thông báo đơn hàng',
  COMMERCIAL: 'Thông báo hợp đồng & dịch vụ',
  FINANCE: 'Thông báo tài chính & thanh toán',
  CLAIM: 'Thông báo khiếu nại',
  SYSTEM: 'Thông báo hệ thống',
};

const TOPIC_FALLBACK_TEMPLATES: Readonly<Record<string, NotificationTemplatePair>> = {
  // Flow 1 — Inbound
  'asn.submitted': {
    title: 'Phiếu nhập kho mới được gửi',
    body: 'Phiếu nhập kho {asnCode} đã được gửi tới kho xử lý.',
  },
  'asn.cancelled': {
    title: 'Phiếu nhập kho đã hủy',
    body: 'Phiếu nhập kho {asnCode} đã được hủy.',
  },
  'asn.arrived': {
    title: 'Hàng nhập kho đã đến nơi',
    body: 'Phiếu nhập kho {asnCode} đã đến kho và sẵn sàng tiếp nhận.',
  },
  'inbound.discrepancy.seller_notified': {
    title: 'Phát hiện sai lệch nhập kho',
    body: 'Phiếu nhập kho {asnCode} có sai lệch kiểm đếm cần kiểm tra.',
  },
  'receipt.discrepancy_reported': {
    title: 'Báo cáo sai lệch biên bản nhận hàng',
    body: 'Biên bản nhận hàng {receiptCode} có sai lệch cần quản lý kho duyệt.',
  },
  'receipt.reviewed': {
    title: 'Biên bản nhận hàng đã được duyệt',
    body: 'Biên bản nhận hàng {receiptCode} ({decision}) đã hoàn tất xét duyệt.',
  },
  'asn.received': {
    title: 'Đã hoàn tất nhận hàng vào kho',
    body: 'Phiếu nhập kho {asnCode} đã hoàn tất kiểm đếm và nhận hàng.',
  },
  'putaway.completed': {
    title: 'Hàng đã lên kệ sẵn sàng mở bán',
    body: 'Lô hàng thuộc phiếu {asnCode} đã được xếp lên kệ thành công.',
  },

  // Flow 2 — Outbound
  'pick.wave_ready': {
    title: 'Đợt lấy hàng mới sẵn sàng',
    body: 'Đợt lấy hàng {waveCode} ({orderCount} đơn) đã sẵn sàng thực hiện.',
  },
  'pick.short_reported': {
    title: 'Báo thiếu hàng khi lấy đơn',
    body: 'Mã SKU {sku} thiếu hàng khi lấy đơn (còn thiếu {remainingQty}).',
  },
  'pick.short_replaced': {
    title: 'Đã xử lý thay thế hàng thiếu',
    body: 'Đã cập nhật hàng thay thế cho mã SKU {sku} trong đợt lấy hàng.',
  },
  'order.cancellation_requested': {
    title: 'Yêu cầu hủy đơn hàng',
    body: 'Đơn hàng {orderCode} có yêu cầu hủy cần xử lý ngay.',
  },
  'order.picked_ready_for_packing': {
    title: 'Đơn hàng sẵn sàng đóng gói',
    body: 'Đơn hàng {orderCode} đã lấy đủ hàng và sẵn sàng đóng gói.',
  },
  'shipment.label_ready': {
    title: 'Nhãn vận đơn đã sẵn sàng',
    body: 'Nhãn vận đơn cho đơn {orderCode} ({trackingCode}) đã được tạo.',
  },
  'shipment.label_failed': {
    title: 'Tạo nhãn vận đơn thất bại',
    body: 'Không thể tạo nhãn vận đơn cho đơn {orderCode}. Vui lòng kiểm tra lại.',
  },
  'parcel.handed_over': {
    title: 'Kiện hàng đã bàn giao vận chuyển',
    body: 'Vận đơn {trackingCode} đã được bàn giao cho đơn vị vận chuyển.',
  },

  // Flow 3 — Tracking & SLA
  'shipment.status_changed': {
    title: 'Cập nhật trạng thái vận đơn',
    body: 'Vận đơn {trackingCode} đã chuyển sang trạng thái {status}.',
  },
  'shipment.returned': {
    title: 'Vận đơn đang hoàn về kho',
    body: 'Vận đơn {trackingCode} đang được hoàn trả về kho.',
  },
  'sla.handover_overdue': {
    title: 'Cảnh báo quá hạn bàn giao SLA',
    body: 'Đơn hàng {orderCode} đã quá hạn bàn giao theo cam kết SLA.',
  },
  'sla.tracking_stalled': {
    title: 'Cảnh báo hành trình vận đơn bị đứng',
    body: 'Vận đơn {trackingCode} chưa có cập nhật hành trình mới.',
  },
  'handover.carrier_pickup_mismatch': {
    title: 'Sai lệch bàn giao hãng vận chuyển',
    body: 'Ghi nhận sai lệch số lượng bàn giao tại phiên {handoverCode}.',
  },

  // Flow 4 — Inventory
  'stock.low': {
    title: 'Cảnh báo tồn kho thấp',
    body: 'Sản phẩm {sku} có tồn kho khả dụng thấp ({availableQty}).',
  },
  'inventory.low_stock': {
    title: 'Tồn kho dưới ngưỡng tối thiểu',
    body: 'Sản phẩm {sku} đang dưới mức tồn kho tối thiểu ({availableQty}).',
  },
  'lot.near_expiry': {
    title: 'Cảnh báo lô hàng sắp hết hạn',
    body: 'Lô hàng {lotCode} của SKU {sku} đang ở trạng thái {status}.',
  },

  // Flow 5 — Orders / Sheets / Webhooks
  'orders.sheet_sync_failed': {
    title: 'Đồng bộ Google Sheet thất bại',
    body: 'Phiên đồng bộ đơn hàng {syncId} gặp lỗi cần kiểm tra.',
  },
  'order.on_hold': {
    title: 'Đơn hàng đang tạm giữ',
    body: 'Đơn hàng {orderCode} đang ở trạng thái tạm giữ.',
  },
  'order.backorder': {
    title: 'Đơn hàng chờ bổ sung tồn kho',
    body: 'Đơn hàng {orderCode} đang ở trạng thái thiếu tồn kho (Backorder).',
  },
  'order.exception_corrected': {
    title: 'Đã xử lý ngoại lệ đơn hàng',
    body: 'Ngoại lệ của đơn hàng {orderCode} đã được khắc phục.',
  },
  'webhook.endpoint_exhausted': {
    title: 'Webhook endpoint ngừng phản hồi',
    body: 'Điểm cuối webhook {endpointUrl} đã vượt quá số lần thử lại.',
  },

  // Flow 6 — Putaway & Bin Override
  'putaway.plan_ready': {
    title: 'Kế hoạch xếp kệ đã sẵn sàng',
    body: 'Kế hoạch xếp kệ cho phiếu {asnCode} đã được tạo.',
  },
  'putaway.capacity_required': {
    title: 'Cần điều chỉnh sức chứa kệ',
    body: 'Vị trí kệ đích không đủ sức chứa cho phiếu {asnCode}.',
  },
  'putaway.bin_overridden': {
    title: 'Đã ghi đè vị trí kệ xếp hàng',
    body: 'Vị trí kệ xếp hàng cho nhiệm vụ {taskId} đã được cập nhật.',
  },
  'putback.retargeted': {
    title: 'Đã chuyển vị trí trả hàng về kệ',
    body: 'Vị trí trả hàng về kệ cho nhiệm vụ {taskId} đã được cập nhật.',
  },

  // Flow 7 — Withdrawal
  'withdrawal.created': {
    title: 'Yêu cầu rút hàng mới',
    body: 'Phiếu rút hàng {withdrawalCode} đã được tạo và chờ xử lý.',
  },
  'withdrawal.dispatched': {
    title: 'Phiếu rút hàng đã xuất kho',
    body: 'Phiếu rút hàng {withdrawalCode} đã xuất khỏi kho.',
  },

  // Flow 8 — Carriers & Rates
  'carrier.health_changed': {
    title: 'Thay đổi tình trạng hãng vận chuyển',
    body: 'Hãng vận chuyển {carrierCode} chuyển trạng thái sang {status}.',
  },
  'rate.collection_completed': {
    title: 'Hoàn tất thu thập bảng giá cước',
    body: 'Đã cập nhật xong bảng giá cước mới từ hãng vận chuyển.',
  },
  'rate.change_alert_created': {
    title: 'Cảnh báo biến động giá cước',
    body: 'Phát hiện thay đổi giá cước từ {carrierCode} cần xem xét.',
  },

  // Flow 9 — AI Forecast
  'ai.forecast_completed': {
    title: 'Dự báo nhu cầu AI hoàn tất',
    body: 'Kết quả dự báo nhu cầu tồn kho AI đã sẵn sàng để xem.',
  },
  'ai.forecast_failed': {
    title: 'Dự báo nhu cầu AI thất bại',
    body: 'Quá trình chạy dự báo AI gặp lỗi. Vui lòng thử lại sau.',
  },

  // Flow 10 — Commercial, SignNow, SePay Zero-Reload & Lifecycle
  'commercial.custom_inquiry_submitted': {
    title: 'Có yêu cầu gói doanh nghiệp mới',
    body: 'Yêu cầu gói tùy chỉnh {inquiryId} đã được gửi tới đội ngũ ORCA.',
  },
  'commercial.custom_contract_offered': {
    title: 'Đề xuất hợp đồng mới đã sẵn sàng',
    body: 'Hợp đồng đề xuất {contractNumber} đã được gửi cho bạn.',
  },
  'commercial.signing_requested': {
    title: 'Yêu cầu ký hợp đồng điện tử',
    body: 'Hợp đồng {contractNumber} đang chờ bạn ký xác nhận.',
  },
  'commercial.contract_signed': {
    title: 'Hợp đồng đã được ký thành công',
    body: 'Hợp đồng {contractNumber} đã ký hoàn tất. Tiến hành thanh toán để kích hoạt.',
  },
  'commercial.signing_declined': {
    title: 'Hợp đồng bị từ chối ký',
    body: 'Hợp đồng {contractNumber} đã bị từ chối ký xác nhận.',
  },
  'commercial.payment_posted': {
    title: 'Ghi nhận thanh toán thành công',
    body: 'Hóa đơn {invoiceNumber} đã được ghi nhận thanh toán.',
  },
  'commercial.bank_receipt_posted': {
    title: 'Đã ghi nhận chứng từ chuyển khoản',
    body: 'Chứng từ chuyển khoản cho hóa đơn {invoiceNumber} đã được tiếp nhận.',
  },
  'commercial.mock_payment_posted': {
    title: 'Ghi nhận thanh toán thử nghiệm',
    body: 'Hóa đơn {invoiceNumber} đã được ghi nhận thanh toán.',
  },
  'sepay.unmatched_received': {
    title: 'Nhận giao dịch SePay chưa khớp',
    body: 'Giao dịch {externalRef} chưa khớp tự động, cần kế toán đối soát.',
  },
  'commercial.service_activated': {
    title: 'Dịch vụ đã được kích hoạt',
    body: 'Thanh toán thành công, dịch vụ và các tính năng ORCA đã được mở khóa.',
  },
  'commercial.plan_change_requested': {
    title: 'Yêu cầu đổi gói dịch vụ',
    body: 'Yêu cầu chuyển sang gói {planName} đã được tiếp nhận.',
  },
  'commercial.plan_change_scheduled': {
    title: 'Đã lên lịch đổi gói dịch vụ',
    body: 'Gói dịch vụ mới {planName} sẽ có hiệu lực vào kỳ tiếp theo.',
  },
  'commercial.plan_change_rejected': {
    title: 'Yêu cầu đổi gói bị từ chối',
    body: 'Yêu cầu thay đổi gói dịch vụ không được phê duyệt.',
  },
  'commercial.plan_change_applied': {
    title: 'Đã áp dụng gói dịch vụ mới',
    body: 'Gói dịch vụ {planName} đã được áp dụng cho tài khoản.',
  },
  'commercial.service_status_changed': {
    title: 'Trạng thái dịch vụ đã thay đổi',
    body: 'Trạng thái dịch vụ hiện tại: {status}.',
  },
  'tenant.status_changed': {
    title: 'Trạng thái doanh nghiệp đã thay đổi',
    body: 'Trạng thái hoạt động của doanh nghiệp chuyển sang {status}.',
  },
  'commercial.closure_requested': {
    title: 'Yêu cầu đóng hợp đồng',
    body: 'Yêu cầu đóng hợp đồng {contractNumber} đã được ghi nhận.',
  },
  'commercial.contract_closed': {
    title: 'Hợp đồng đã đóng',
    body: 'Hợp đồng {contractNumber} đã hoàn tất thanh lý và đóng.',
  },
  'invoice.issued': {
    title: 'Hóa đơn mới đã được phát hành',
    body: 'Hóa đơn {invoiceNumber} đã được phát hành.',
  },
  'invoice.due_soon': {
    title: 'Hóa đơn sắp đến hạn thanh toán',
    body: 'Hóa đơn {invoiceNumber} sắp đến hạn thanh toán. Vui lòng kiểm tra.',
  },
  'payout.sent': {
    title: 'Đã gửi đối soát chi trả COD',
    body: 'Phiếu chi trả {payoutCode} đã được gửi tới người bán.',
  },
  'payout.confirmed': {
    title: 'Người bán đã xác nhận chi trả',
    body: 'Phiếu chi trả {payoutCode} đã được xác nhận.',
  },
  'payout.disputed': {
    title: 'Khiếu nại đối soát chi trả COD',
    body: 'Phiếu chi trả {payoutCode} đang có tranh chấp cần xử lý.',
  },
  'payout.resolved': {
    title: 'Đã giải quyết tranh chấp chi trả',
    body: 'Tranh chấp của phiếu chi trả {payoutCode} đã được giải quyết.',
  },
  'payout.approved': {
    title: 'Đã phê duyệt lệnh chi trả COD',
    body: 'Phiếu chi trả {payoutCode} đã được phê duyệt thanh toán.',
  },
  'payout.paid': {
    title: 'Đã hoàn tất chi trả COD',
    body: 'Phiếu chi trả {payoutCode} đã được chuyển khoản thành công.',
  },

  // Cross-role: Returns, Claims, Inventory Ops, Warehouse Assignment
  'return.requested': {
    title: 'Yêu cầu trả hàng mới',
    body: 'Phiếu trả hàng {returnCode} đã được gửi.',
  },
  'return.reverse_requested': {
    title: 'Yêu cầu thu hồi hoàn hàng',
    body: 'Yêu cầu vận chuyển thu hồi cho phiếu {returnCode} đã được tạo.',
  },
  'return.reverse_authorized': {
    title: 'Đã duyệt vận chuyển thu hồi',
    body: 'Phiếu trả hàng {returnCode} đã được cấp quyền thu hồi.',
  },
  'return.authorized': {
    title: 'Đã duyệt yêu cầu trả hàng',
    body: 'Phiếu trả hàng {returnCode} đã được phê duyệt.',
  },
  'return.arrived': {
    title: 'Hàng hoàn trả đã về kho',
    body: 'Phiếu trả hàng {returnCode} đã về tới kho kiểm tra.',
  },
  'return.inspected': {
    title: 'Đã kiểm tra chất lượng hàng hoàn',
    body: 'Phiếu trả hàng {returnCode} đã hoàn tất bước kiểm tra.',
  },
  'return.reviewed': {
    title: 'Đã duyệt xử lý hàng hoàn trả',
    body: 'Phiếu trả hàng {returnCode} đã hoàn tất xét duyệt.',
  },
  'return.restocked': {
    title: 'Đã nhập lại kho hàng hoàn trả',
    body: 'Sản phẩm thuộc phiếu {returnCode} đã được nhập lại tồn kho.',
  },
  'claim.opened': {
    title: 'Hồ sơ khiếu nại mới',
    body: 'Khiếu nại {claimCode} đã được mở và chờ tiếp nhận.',
  },
  'claim.evidence_submitted': {
    title: 'Đã bổ sung chứng từ khiếu nại',
    body: 'Khiếu nại {claimCode} vừa được bổ sung bằng chứng mới.',
  },
  'claim.investigated': {
    title: 'Đã hoàn tất xác minh khiếu nại',
    body: 'Khiếu nại {claimCode} đã có kết quả điều tra.',
  },
  'claim.decided': {
    title: 'Đã có quyết định khiếu nại',
    body: 'Khiếu nại {claimCode} đã được ra quyết định xử lý.',
  },
  'claim.credit_posted': {
    title: 'Đã ghi nhận bù trừ khiếu nại',
    body: 'Khoản bù trừ cho khiếu nại {claimCode} đã được hạch toán.',
  },
  'count.assigned': {
    title: 'Phân công kiểm kê tồn kho',
    body: 'Phiên kiểm kê {countCode} đã được phân công cho bạn.',
  },
  'count.observed': {
    title: 'Đã ghi nhận kết quả kiểm kê',
    body: 'Phiên kiểm kê {countCode} đã cập nhật số liệu thực tế.',
  },
  'count.recount_requested': {
    title: 'Yêu cầu kiểm kê lại',
    body: 'Phiên kiểm kê {countCode} cần được kiểm đếm lại.',
  },
  'disposal.requested': {
    title: 'Yêu cầu tiêu hủy hàng tồn kho',
    body: 'Phiếu tiêu hủy {disposalCode} đang chờ phê duyệt.',
  },
  'disposal.reviewed': {
    title: 'Đã duyệt yêu cầu tiêu hủy',
    body: 'Phiếu tiêu hủy {disposalCode} đã được xét duyệt.',
  },
  'disposal.revoked': {
    title: 'Đã thu hồi yêu cầu tiêu hủy',
    body: 'Phiếu tiêu hủy {disposalCode} đã bị hủy bỏ.',
  },
  'disposal.executed': {
    title: 'Đã hoàn tất tiêu hủy hàng',
    body: 'Phiếu tiêu hủy {disposalCode} đã được thực hiện xong.',
  },
  'lot.recalled': {
    title: 'Cảnh báo thu hồi lô hàng',
    body: 'Lô hàng {lotCode} của SKU {sku} đã được đánh dấu thu hồi khẩn.',
  },
  'recall.customer_notification': {
    title: 'Thông báo thu hồi sản phẩm tới khách hàng',
    body: 'Cần thông báo thu hồi lô hàng {lotCode} tới khách hàng liên quan.',
  },
  'platform_user.warehouses_assigned': {
    title: 'Cập nhật phân công kho làm việc',
    body: 'Danh sách kho được phân công của bạn vừa được cập nhật.',
  },
};

const PRIORITY_CODE_PARAMS = [
  'invoiceNumber',
  'contractNumber',
  'asnCode',
  'receiptCode',
  'orderCode',
  'trackingCode',
  'waveCode',
  'externalRef',
  'claimCode',
  'returnCode',
  'withdrawalCode',
  'countCode',
  'disposalCode',
  'lotCode',
  'sku',
  'code',
] as const;

function normalizeInterpolatedText(text: string): string {
  return text
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function looksLikeUnresolvedKey(
  value: string,
  fullKey: string,
  strippedKey: string,
  candidate: string,
): boolean {
  if (!value) {
    return true;
  }
  if (value === fullKey || value === strippedKey || value === candidate) {
    return true;
  }
  if (value.startsWith(NOTIFICATIONS_PREFIX) || value.startsWith('events.')) {
    return true;
  }
  if (value.endsWith(`.${strippedKey}`) || value.endsWith(`.${candidate}`)) {
    return true;
  }
  return false;
}

function resolveTranslatedValue(
  rawKey: string,
  params: RealtimeParams,
  translate?: NotificationTranslator,
): string | null {
  if (!translate || !rawKey.trim()) {
    return null;
  }

  const fullKey = rawKey.trim();
  const strippedKey = fullKey.startsWith(NOTIFICATIONS_PREFIX)
    ? fullKey.slice(NOTIFICATIONS_PREFIX.length)
    : fullKey;
  const candidates = strippedKey !== fullKey ? [strippedKey, fullKey] : [fullKey];

  for (const candidate of candidates) {
    try {
      const translated = translate(candidate, params);
      if (typeof translated !== 'string') {
        continue;
      }
      const trimmed = translated.trim();
      if (looksLikeUnresolvedKey(trimmed, fullKey, strippedKey, candidate)) {
        continue;
      }
      return /\{[a-zA-Z0-9_]+\}/.test(trimmed)
        ? normalizeInterpolatedText(interpolateNotificationTemplate(trimmed, params))
        : trimmed;
    } catch {
      continue;
    }
  }

  return null;
}

function buildGenericBody(params: RealtimeParams): string {
  for (const key of PRIORITY_CODE_PARAMS) {
    const val = params[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return `Cập nhật mới cho ${String(val).trim()}.`;
    }
  }
  return 'Có cập nhật mới cần bạn kiểm tra.';
}

function findFallbackTemplate(notification: InAppNotificationDto): NotificationTemplatePair {
  const normalizedTopic = notification.topic.trim().toLowerCase();
  const direct = TOPIC_FALLBACK_TEMPLATES[normalizedTopic];
  if (direct) {
    return direct;
  }

  const params = notification.params ?? {};
  return {
    title: CATEGORY_FALLBACK_TITLES[notification.category] ?? CATEGORY_FALLBACK_TITLES.SYSTEM,
    body: buildGenericBody(params),
  };
}

/**
 * Formats an `InAppNotificationDto` into human-readable localized `title` and `body`,
 * safely resolving scoped or root translation keys and falling back to Vietnamese templates
 * so raw i18n keys never leak to the UI.
 */
export function formatNotificationText(
  notification: InAppNotificationDto,
  translate?: NotificationTranslator,
): FormattedNotificationText {
  const params = notification.params ?? {};
  const fallback = findFallbackTemplate(notification);

  const translatedTitle = resolveTranslatedValue(notification.titleKey, params, translate);
  const translatedBody = resolveTranslatedValue(notification.bodyKey, params, translate);

  const fallbackTitle = normalizeInterpolatedText(
    interpolateNotificationTemplate(fallback.title, params),
  );
  const fallbackBody = normalizeInterpolatedText(
    interpolateNotificationTemplate(fallback.body, params),
  );

  return {
    title: translatedTitle || fallbackTitle || CATEGORY_FALLBACK_TITLES.SYSTEM,
    body: translatedBody || fallbackBody || 'Có cập nhật mới cần bạn kiểm tra.',
  };
}
