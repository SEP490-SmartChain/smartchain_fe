import {
  REALTIME_SYNC_AREAS,
  REALTIME_TOPICS,
  type InAppNotificationDto,
  type MarkAllReadResponse,
  type MarkReadResponse,
  type NotificationListQuery,
  type NotificationListResponse,
  type RealtimeClientPort,
  type RealtimeConnectionStatus,
  type RealtimeStreamHandlers,
  type RealtimeStreamSubscription,
  type RealtimeUiSyncPayload,
  type SseEnvelope,
  type SseNotificationEvent,
  type SseUiSyncEvent,
  type UnreadCountResponse,
} from './contracts';

export const CANONICAL_FE_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const CANONICAL_FE_INVOICE_ID = '88888888-8888-4888-8888-888888888802';
export const CANONICAL_FE_RECEIPT_ID = '88888888-8888-4888-8888-888888888803';
export const CANONICAL_FE_CONTRACT_ID = '88888888-8888-4888-8888-888888888801';

export function makeNotificationDto(
  overrides: Partial<InAppNotificationDto> = {},
): InAppNotificationDto {
  return {
    id: overrides.id ?? '77777777-7777-4777-8777-777777777701',
    dedupKey: overrides.dedupKey ?? 'asn.arrived:asn-1:SELLER_OWNER',
    topic: overrides.topic ?? REALTIME_TOPICS.ASN_ARRIVED,
    category: overrides.category ?? 'INBOUND',
    severity: overrides.severity ?? 'INFO',
    titleKey: overrides.titleKey ?? 'Notifications.events.asn_arrived.title',
    bodyKey: overrides.bodyKey ?? 'Notifications.events.asn_arrived.body',
    params: overrides.params ?? { asnCode: 'ASN-2026-001' },
    targetPath: overrides.targetPath ?? '/asns',
    resourceType: overrides.resourceType ?? 'asn',
    resourceId: overrides.resourceId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    createdAt: overrides.createdAt ?? '2026-11-24T04:00:00.000Z',
    isRead: overrides.isRead ?? false,
    readAt: overrides.readAt ?? null,
  };
}

export function makeSseUiSyncEvent(
  overrides: Partial<RealtimeUiSyncPayload> = {},
): SseUiSyncEvent {
  return {
    type: 'ui_sync',
    uiSync: {
      topic: overrides.topic ?? REALTIME_TOPICS.ASN_ARRIVED,
      syncAreas: overrides.syncAreas ?? [REALTIME_SYNC_AREAS.INBOUND_ASN],
      resourceType: overrides.resourceType ?? 'asn',
      resourceId: overrides.resourceId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: overrides.status ?? 'ARRIVED',
      occurredAt: overrides.occurredAt ?? '2026-11-24T04:00:00.000Z',
      meta: overrides.meta,
    },
  };
}

export function makeSseNotificationEvent(
  notificationOverrides: Partial<InAppNotificationDto> = {},
  uiSyncOverrides?: Partial<RealtimeUiSyncPayload>,
): SseNotificationEvent {
  const notification = makeNotificationDto(notificationOverrides);
  return {
    type: 'notification',
    notification,
    uiSync: uiSyncOverrides
      ? {
          topic: uiSyncOverrides.topic ?? notification.topic,
          syncAreas: uiSyncOverrides.syncAreas ?? [REALTIME_SYNC_AREAS.INBOUND_ASN],
          resourceType: uiSyncOverrides.resourceType ?? notification.resourceType,
          resourceId: uiSyncOverrides.resourceId ?? notification.resourceId,
          status: uiSyncOverrides.status ?? null,
          occurredAt: uiSyncOverrides.occurredAt ?? notification.createdAt,
          meta: uiSyncOverrides.meta,
        }
      : undefined,
  };
}

export function makeCommercialContractSignedEvent(
  overrides: Partial<InAppNotificationDto> = {},
): SseNotificationEvent {
  return makeSseNotificationEvent(
    {
      id: '77777777-7777-4777-8777-777777777710',
      dedupKey: `commercial.contract_signed:${CANONICAL_FE_CONTRACT_ID}`,
      topic: REALTIME_TOPICS.COMMERCIAL_CONTRACT_SIGNED,
      category: 'COMMERCIAL',
      severity: 'SUCCESS',
      titleKey: 'Notifications.events.commercial_contract_signed.title',
      bodyKey: 'Notifications.events.commercial_contract_signed.body',
      params: { contractNumber: 'HD-2026-0001' },
      targetPath: '/onboarding',
      resourceType: 'contract',
      resourceId: CANONICAL_FE_CONTRACT_ID,
      ...overrides,
    },
    {
      topic: REALTIME_TOPICS.COMMERCIAL_CONTRACT_SIGNED,
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING, REALTIME_SYNC_AREAS.COMMERCIAL_BILLING],
      resourceType: 'contract',
      resourceId: CANONICAL_FE_CONTRACT_ID,
      status: 'SIGNED',
      meta: { shouldCloseSigningModal: true },
    },
  );
}

export function makeCommercialPaymentPostedEvent(
  overrides: Partial<InAppNotificationDto> = {},
): SseNotificationEvent {
  return makeSseNotificationEvent(
    {
      id: '77777777-7777-4777-8777-777777777711',
      dedupKey: `commercial.payment_posted:${CANONICAL_FE_RECEIPT_ID}`,
      topic: REALTIME_TOPICS.COMMERCIAL_PAYMENT_POSTED,
      category: 'FINANCE',
      severity: 'SUCCESS',
      titleKey: 'Notifications.events.commercial_payment_posted.title',
      bodyKey: 'Notifications.events.commercial_payment_posted.body',
      params: {
        invoiceNumber: 'INV-2026-0001',
        amountVnd: 1500000,
        receiptId: CANONICAL_FE_RECEIPT_ID,
      },
      targetPath: '/billing',
      resourceType: 'invoice',
      resourceId: CANONICAL_FE_INVOICE_ID,
      ...overrides,
    },
    {
      topic: REALTIME_TOPICS.COMMERCIAL_PAYMENT_POSTED,
      syncAreas: [
        REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING,
        REALTIME_SYNC_AREAS.COMMERCIAL_BILLING,
        REALTIME_SYNC_AREAS.COMMERCIAL_UNMATCHED,
      ],
      resourceType: 'invoice',
      resourceId: CANONICAL_FE_INVOICE_ID,
      status: 'POSTED',
      meta: {
        invoiceNumber: 'INV-2026-0001',
        amountVnd: 1500000,
        receiptId: CANONICAL_FE_RECEIPT_ID,
      },
    },
  );
}

export function makeCommercialServiceActivatedEvent(
  overrides: Partial<InAppNotificationDto> = {},
): SseNotificationEvent {
  return makeSseNotificationEvent(
    {
      id: '77777777-7777-4777-8777-777777777712',
      dedupKey: `commercial.service_activated:${CANONICAL_FE_TENANT_ID}`,
      topic: REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED,
      category: 'COMMERCIAL',
      severity: 'SUCCESS',
      titleKey: 'Notifications.events.commercial_service_activated.title',
      bodyKey: 'Notifications.events.commercial_service_activated.body',
      params: { tenantId: CANONICAL_FE_TENANT_ID },
      targetPath: '/billing',
      resourceType: 'tenant',
      resourceId: CANONICAL_FE_TENANT_ID,
      ...overrides,
    },
    {
      topic: REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED,
      syncAreas: [
        REALTIME_SYNC_AREAS.COMMERCIAL_ONBOARDING,
        REALTIME_SYNC_AREAS.COMMERCIAL_BILLING,
        REALTIME_SYNC_AREAS.AUTH_PROFILE,
      ],
      resourceType: 'tenant',
      resourceId: CANONICAL_FE_TENANT_ID,
      status: 'ACTIVE',
      meta: { refreshProfile: true },
    },
  );
}

export class FakeRealtimeNotificationClient implements RealtimeClientPort {
  private items: InAppNotificationDto[];
  private activeHandlers: RealtimeStreamHandlers | null = null;
  public markReadCalls: string[] = [];
  public markAllReadCalls = 0;
  public streamOpenCount = 0;

  constructor(initialItems: readonly InAppNotificationDto[] = [makeNotificationDto()]) {
    this.items = [...initialItems];
  }

  async listNotifications(query: NotificationListQuery = {}): Promise<NotificationListResponse> {
    let filtered = [...this.items];
    if (query.unreadOnly) {
      filtered = filtered.filter((item) => !item.isRead);
    }
    if (query.category) {
      filtered = filtered.filter((item) => item.category === query.category);
    }
    const limit = query.limit ?? 20;
    const sliced = filtered.slice(0, limit);
    return {
      items: sliced,
      unreadCount: this.items.filter((item) => !item.isRead).length,
      pagination: {
        limit,
        hasNext: filtered.length > limit,
        nextCursor: filtered.length > limit ? (sliced.at(-1)?.id ?? null) : null,
      },
    };
  }

  async getUnreadCount(): Promise<UnreadCountResponse> {
    return {
      unreadCount: this.items.filter((item) => !item.isRead).length,
    };
  }

  async markAsRead(id: string): Promise<MarkReadResponse> {
    this.markReadCalls.push(id);
    const readAt = '2026-11-24T04:05:00.000Z';
    this.items = this.items.map((item) =>
      item.id === id && !item.isRead ? { ...item, isRead: true, readAt } : item,
    );
    const target = this.items.find((item) => item.id === id);
    return {
      id,
      readAt: target?.readAt ?? readAt,
      unreadCount: this.items.filter((item) => !item.isRead).length,
    };
  }

  async markAllAsRead(): Promise<MarkAllReadResponse> {
    this.markAllReadCalls += 1;
    const readAt = '2026-11-24T04:05:00.000Z';
    let markedCount = 0;
    this.items = this.items.map((item) => {
      if (!item.isRead) {
        markedCount += 1;
        return { ...item, isRead: true, readAt };
      }
      return item;
    });
    return { markedCount, unreadCount: 0 };
  }

  openStream(handlers: RealtimeStreamHandlers): RealtimeStreamSubscription {
    this.streamOpenCount += 1;
    this.activeHandlers = handlers;
    handlers.onStatusChange?.('connected');
    handlers.onEvent({
      type: 'connected',
      serverTime: '2026-11-24T04:00:00.000Z',
      unreadCount: this.items.filter((item) => !item.isRead).length,
    });
    return {
      close: () => {
        if (this.activeHandlers === handlers) {
          this.activeHandlers = null;
          handlers.onStatusChange?.('disconnected');
        }
      },
    };
  }

  emitTestEvent(event: SseEnvelope): void {
    if (event.type === 'notification') {
      const exists = this.items.some((item) => item.id === event.notification.id);
      if (!exists) {
        this.items = [event.notification, ...this.items];
      }
    }
    this.activeHandlers?.onEvent(event);
  }

  emitStatus(status: RealtimeConnectionStatus): void {
    this.activeHandlers?.onStatusChange?.(status);
  }
}

export function makeFakeRealtimeClient(
  initialItems: readonly InAppNotificationDto[] = [makeNotificationDto()],
): FakeRealtimeNotificationClient {
  return new FakeRealtimeNotificationClient(initialItems);
}
