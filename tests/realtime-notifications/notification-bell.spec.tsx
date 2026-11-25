import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  C08_COMPONENTS,
  NotificationBellPopover,
  formatNotificationText,
  formatNotificationTimestamp,
  formatUnreadBadge,
  presentRealtimeToast,
  type ToastCallOptions,
  type ToastLike,
} from '@/features/realtime-notifications/features/notification-bell';
import {
  REALTIME_TOPICS,
  makeCommercialContractSignedEvent,
  makeCommercialPaymentPostedEvent,
  makeCommercialServiceActivatedEvent,
  makeNotificationDto,
  type InAppNotificationDto,
  type RealtimeParams,
  type RealtimeSeverity,
} from '@/features/realtime-notifications/shared';

interface ToastSpyCall {
  readonly method: 'error' | 'warning' | 'success' | 'info';
  readonly title: string;
  readonly options?: ToastCallOptions;
}

function createToastSpy() {
  const calls: ToastSpyCall[] = [];
  const toastApi: ToastLike = {
    error: (title, options) => {
      calls.push({ method: 'error', title, options });
      return 'toast-err';
    },
    warning: (title, options) => {
      calls.push({ method: 'warning', title, options });
      return 'toast-warn';
    },
    success: (title, options) => {
      calls.push({ method: 'success', title, options });
      return 'toast-ok';
    },
    info: (title, options) => {
      calls.push({ method: 'info', title, options });
      return 'toast-info';
    },
  };
  return { calls, toastApi };
}

describe('C08 notification-bell exports', () => {
  test('exports C08_COMPONENTS barrel array cleanly', () => {
    assert.deepEqual([...C08_COMPONENTS], [NotificationBellPopover]);
  });
});

describe('formatNotificationText', () => {
  test('renders human-readable Vietnamese fallback with interpolated params and never raw keys', () => {
    const asnDto = makeNotificationDto({
      topic: REALTIME_TOPICS.ASN_ARRIVED,
      titleKey: 'Notifications.events.asn_arrived.title',
      bodyKey: 'Notifications.events.asn_arrived.body',
      params: { asnCode: 'ASN-2026-001' },
    });
    const asnFormatted = formatNotificationText(asnDto);
    assert.ok(asnFormatted.title.length > 0);
    assert.match(asnFormatted.body, /ASN-2026-001/);
    assert.doesNotMatch(asnFormatted.title, /Notifications\./);
    assert.doesNotMatch(asnFormatted.body, /Notifications\./);
    assert.doesNotMatch(asnFormatted.body, /\{[a-zA-Z0-9_]+\}/);

    const paymentDto = makeCommercialPaymentPostedEvent().notification;
    const paymentFormatted = formatNotificationText(paymentDto);
    assert.match(paymentFormatted.body, /INV-2026-0001/);
    assert.doesNotMatch(paymentFormatted.title, /Notifications\./);
    assert.doesNotMatch(paymentFormatted.body, /Notifications\./);
  });

  test('covers daily operational and Flow 10 topics without raw key or placeholder leaks', () => {
    const samples: readonly InAppNotificationDto[] = [
      makeCommercialContractSignedEvent().notification,
      makeCommercialPaymentPostedEvent().notification,
      makeCommercialServiceActivatedEvent().notification,
      makeNotificationDto({
        topic: REALTIME_TOPICS.RECEIPT_REVIEWED,
        category: 'INBOUND',
        params: { receiptCode: 'REC-001', decision: 'APPROVE' },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.PUTAWAY_COMPLETED,
        category: 'INBOUND',
        params: { asnCode: 'ASN-2026-009' },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.ORDER_CANCELLATION_REQUESTED,
        category: 'ORDER',
        params: { orderCode: 'ORD-2026-012' },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.PICK_WAVE_READY,
        category: 'OUTBOUND',
        params: { waveCode: 'PW-001', orderCount: 5 },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.SHIPMENT_LABEL_READY,
        category: 'SHIPMENT',
        params: { orderCode: 'ORD-2026-012', trackingCode: 'TRK-888' },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.PARCEL_HANDED_OVER,
        category: 'SHIPMENT',
        params: { trackingCode: 'TRK-888' },
      }),
      makeNotificationDto({
        topic: REALTIME_TOPICS.SEPAY_UNMATCHED_RECEIVED,
        category: 'FINANCE',
        params: { externalRef: 'SEPAY-TX-100' },
      }),
    ];

    for (const item of samples) {
      const formatted = formatNotificationText(item);
      assert.ok(formatted.title.length > 0, `Expected title for ${item.topic}`);
      assert.ok(formatted.body.length > 0, `Expected body for ${item.topic}`);
      assert.doesNotMatch(formatted.title, /Notifications\./);
      assert.doesNotMatch(formatted.body, /Notifications\./);
      assert.doesNotMatch(formatted.body, /\{[a-zA-Z0-9_]+\}/);
    }
  });

  test('supports scoped useTranslations("Notifications"), full-key translators, and missing key fallback', () => {
    const dto = makeNotificationDto({
      topic: REALTIME_TOPICS.ASN_ARRIVED,
      titleKey: 'Notifications.events.asn_arrived.title',
      bodyKey: 'Notifications.events.asn_arrived.body',
      params: { asnCode: 'ASN-777' },
    });

    const scopedTranslator = (key: string, values?: RealtimeParams): string => {
      if (key === 'events.asn_arrived.title') {
        return 'Inbound ASN Arrived';
      }
      if (key === 'events.asn_arrived.body') {
        return `Shipment ${String(values?.asnCode ?? '')} arrived at dock.`;
      }
      throw new Error(`MISSING_MESSAGE: ${key}`);
    };

    const scopedResult = formatNotificationText(dto, scopedTranslator);
    assert.equal(scopedResult.title, 'Inbound ASN Arrived');
    assert.equal(scopedResult.body, 'Shipment ASN-777 arrived at dock.');

    const fullKeyTranslator = (key: string): string => {
      if (key === 'Notifications.events.asn_arrived.title') {
        return 'Full Key Title';
      }
      if (key === 'Notifications.events.asn_arrived.body') {
        return 'ASN {asnCode} ready';
      }
      return key;
    };

    const fullResult = formatNotificationText(dto, fullKeyTranslator);
    assert.equal(fullResult.title, 'Full Key Title');
    assert.equal(fullResult.body, 'ASN ASN-777 ready');

    const unknownDto = makeNotificationDto({
      topic: 'unknown.custom_topic',
      category: 'ORDER',
      titleKey: 'Notifications.events.foo.title',
      bodyKey: 'Notifications.events.foo.body',
      params: { orderCode: 'ORD-555' },
    });
    const brokenTranslator = (key: string): string => {
      if (key.includes('title')) {
        throw new Error('MISSING_MESSAGE');
      }
      return 'Notifications.events.foo.body';
    };

    const safeResult = formatNotificationText(unknownDto, brokenTranslator);
    assert.doesNotMatch(safeResult.title, /Notifications\.|events\./);
    assert.doesNotMatch(safeResult.body, /Notifications\.|events\./);
    assert.match(safeResult.body, /ORD-555/);
  });
});

describe('presentRealtimeToast', () => {
  test('maps all 4 severities to expected Sonner methods and durations', () => {
    const expectations: ReadonlyArray<{
      readonly severity: RealtimeSeverity;
      readonly expectedMethod: ToastSpyCall['method'];
      readonly expectedDuration: number;
    }> = [
      { severity: 'CRITICAL', expectedMethod: 'error', expectedDuration: 10000 },
      { severity: 'WARNING', expectedMethod: 'warning', expectedDuration: 7000 },
      { severity: 'SUCCESS', expectedMethod: 'success', expectedDuration: 5000 },
      { severity: 'INFO', expectedMethod: 'info', expectedDuration: 4500 },
    ];

    for (const entry of expectations) {
      const { calls, toastApi } = createToastSpy();
      const dto = makeNotificationDto({ severity: entry.severity, targetPath: '/billing' });
      let navigatedTo: string | null = null;

      presentRealtimeToast(dto, {
        toastApi,
        onNavigate: (targetPath) => {
          navigatedTo = targetPath;
        },
      });

      assert.equal(calls.length, 1);
      const call = calls[0];
      assert.ok(call);
      assert.equal(call.method, entry.expectedMethod);
      assert.equal(call.options?.duration, entry.expectedDuration);
      assert.ok(call.title.length > 0);
      assert.ok((call.options?.description ?? '').length > 0);
      assert.ok(call.options?.action);
      call.options.action.onClick();
      assert.equal(navigatedTo, '/billing');
    }
  });

  test('sanitizes external and protocol-relative targetPath before calling onNavigate', () => {
    for (const unsafePath of ['https://evil.example/phish', '//evil.example/phish']) {
      const { calls, toastApi } = createToastSpy();
      const navigated: string[] = [];

      presentRealtimeToast(makeNotificationDto({ targetPath: unsafePath }), {
        toastApi,
        onNavigate: (safePath) => navigated.push(safePath),
      });

      calls[0]?.options?.action?.onClick();
      assert.deepEqual(navigated, ['/']);
    }
  });

  test('omits action when onNavigate is absent and applies custom translate', () => {
    const { calls, toastApi } = createToastSpy();
    presentRealtimeToast(makeNotificationDto({ severity: 'INFO' }), {
      toastApi,
      translate: (key) => (key.endsWith('.title') ? 'Custom Info Title' : 'Custom Info Body'),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'info');
    assert.equal(calls[0]?.title, 'Custom Info Title');
    assert.equal(calls[0]?.options?.description, 'Custom Info Body');
    assert.equal(calls[0]?.options?.action, undefined);
  });
});

describe('NotificationBellPopover SSR & accessibility', () => {
  test('renders unread badge as 5, 99+ for 142, and hides badge when 0', () => {
    assert.equal(formatUnreadBadge(5), '5');
    assert.equal(formatUnreadBadge(142), '99+');
    assert.equal(formatUnreadBadge(0), '');

    const htmlFive = renderToStaticMarkup(
      createElement(NotificationBellPopover, {
        items: [],
        unreadCount: 5,
      }),
    );
    assert.match(htmlFive, /data-testid="notification-unread-badge"[^>]*>5</);
    assert.match(htmlFive, /aria-haspopup="dialog"/);
    assert.match(htmlFive, /aria-expanded="false"/);
    assert.doesNotMatch(htmlFive, /role="dialog"/);

    const htmlCapped = renderToStaticMarkup(
      createElement(NotificationBellPopover, {
        items: [],
        unreadCount: 142,
      }),
    );
    assert.match(htmlCapped, /data-testid="notification-unread-badge"[^>]*>99\+</);

    const htmlZero = renderToStaticMarkup(
      createElement(NotificationBellPopover, {
        items: [],
        unreadCount: 0,
      }),
    );
    assert.doesNotMatch(htmlZero, /data-testid="notification-unread-badge"/);
  });

  test('renders connected live indicator, filter tabs, items, and mark-all-read disabled state', () => {
    const unreadItem = makeCommercialPaymentPostedEvent({
      id: 'notif-unread',
      isRead: false,
      createdAt: '2026-11-24T04:00:00.000Z',
    }).notification;
    const readItem = makeNotificationDto({
      id: 'notif-read',
      isRead: true,
      readAt: '2026-11-24T04:01:00.000Z',
      severity: 'CRITICAL',
      topic: REALTIME_TOPICS.ORDER_CANCELLATION_REQUESTED,
      category: 'ORDER',
      params: { orderCode: 'ORD-999' },
      createdAt: '2026-11-24T03:45:00.000Z',
    });

    const htmlOpen = renderToStaticMarkup(
      createElement(NotificationBellPopover, {
        items: [unreadItem, readItem],
        unreadCount: 1,
        connectionStatus: 'connected',
        defaultOpen: true,
        now: '2026-11-24T04:05:00.000Z',
        labels: {
          title: 'Notifications',
          markAllRead: 'Mark all read',
          allTab: 'All',
          unreadTab: 'Unread',
          live: 'Live',
          offline: 'Offline',
        },
      }),
    );

    assert.match(htmlOpen, /data-testid="notification-live-indicator"/);
    assert.match(htmlOpen, /bg-emerald-500/);
    assert.match(htmlOpen, /aria-expanded="true"/);
    assert.match(htmlOpen, /role="dialog"/);
    assert.match(htmlOpen, /role="tablist"/);
    assert.match(htmlOpen, /role="tab"[^>]*>All</);
    assert.match(htmlOpen, /Unread/);
    assert.match(htmlOpen, />Live</);
    assert.match(htmlOpen, /INV-2026-0001/);
    assert.match(htmlOpen, /ORD-999/);
    assert.match(htmlOpen, /5 phút trước/);
    assert.match(htmlOpen, /data-unread="true"/);
    assert.match(htmlOpen, /data-unread="false"/);
    assert.match(htmlOpen, /data-severity="CRITICAL"/);
    assert.match(htmlOpen, /Tài chính/);
    assert.match(htmlOpen, /Đơn hàng/);
    assert.doesNotMatch(htmlOpen, /<button[^>]*disabled=""[^>]*>Mark all read<\/button>/);

    const htmlEmptyReadOnly = renderToStaticMarkup(
      createElement(NotificationBellPopover, {
        items: [],
        unreadCount: 0,
        connectionStatus: 'disconnected',
        defaultOpen: true,
        labels: {
          markAllRead: 'Mark all read',
          empty: 'Nothing here',
          offline: 'Offline',
        },
      }),
    );

    assert.doesNotMatch(htmlEmptyReadOnly, /data-testid="notification-live-indicator"/);
    assert.match(htmlEmptyReadOnly, />Offline</);
    assert.match(htmlEmptyReadOnly, /Nothing here/);
    assert.match(htmlEmptyReadOnly, /disabled=""[^>]*>Mark all read<\/button>/);
    assert.equal(formatNotificationTimestamp('invalid-date'), '');
    assert.equal(formatUnreadBadge(-3), '');
  });
});
