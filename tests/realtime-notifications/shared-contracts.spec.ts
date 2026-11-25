import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FakeRealtimeNotificationClient,
  REALTIME_API_PATHS,
  REALTIME_SYNC_AREAS,
  REALTIME_TOPICS,
  interpolateNotificationTemplate,
  makeCommercialContractSignedEvent,
  makeCommercialPaymentPostedEvent,
  makeCommercialServiceActivatedEvent,
  makeFakeRealtimeClient,
  makeNotificationDto,
  makeSseNotificationEvent,
  makeSseUiSyncEvent,
  sanitizeRealtimeTargetPath,
  type SseEnvelope,
} from '@/features/realtime-notifications/shared';

describe('Wave 1 Realtime Notifications FE Shared Contracts (C02)', () => {
  test('defines canonical API paths with URL-escaped notification id', () => {
    assert.equal(REALTIME_API_PATHS.LIST, '/v1/notifications');
    assert.equal(REALTIME_API_PATHS.UNREAD_COUNT, '/v1/notifications/unread-count');
    assert.equal(REALTIME_API_PATHS.READ_ALL, '/v1/notifications/read-all');
    assert.equal(REALTIME_API_PATHS.STREAM, '/v1/notifications/stream');
    assert.equal(REALTIME_API_PATHS.markRead('abc-123'), '/v1/notifications/abc-123/read');
  });

  test('sanitizes targetPath to internal routes only', () => {
    assert.equal(sanitizeRealtimeTargetPath('/billing'), '/billing');
    assert.equal(sanitizeRealtimeTargetPath('https://evil.example/phish'), '/');
    assert.equal(sanitizeRealtimeTargetPath('//evil.example/phish'), '/');
  });

  test('interpolates params safely without exposing undefined tokens', () => {
    const rendered = interpolateNotificationTemplate(
      'Đơn {orderCode} tổng {amountVnd} đã thanh toán {missing}',
      { orderCode: 'ORD-001', amountVnd: 250000 },
    );
    assert.equal(rendered, 'Đơn ORD-001 tổng 250000 đã thanh toán ');
  });

  test('provides canonical Flow 10 zero-reload SSE fixtures', () => {
    const signed = makeCommercialContractSignedEvent();
    assert.equal(signed.notification.topic, REALTIME_TOPICS.COMMERCIAL_CONTRACT_SIGNED);
    assert.equal(signed.uiSync?.meta?.shouldCloseSigningModal, true);

    const posted = makeCommercialPaymentPostedEvent();
    assert.equal(posted.notification.topic, REALTIME_TOPICS.COMMERCIAL_PAYMENT_POSTED);
    assert.ok(posted.uiSync?.syncAreas.includes(REALTIME_SYNC_AREAS.COMMERCIAL_BILLING));

    const activated = makeCommercialServiceActivatedEvent();
    assert.equal(activated.notification.topic, REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED);
    assert.equal(activated.uiSync?.meta?.refreshProfile, true);
    assert.ok(activated.uiSync?.syncAreas.includes(REALTIME_SYNC_AREAS.AUTH_PROFILE));
  });

  test('FakeRealtimeNotificationClient emits connected snapshot and handles mark-read', async () => {
    const first = makeNotificationDto({ id: 'notif-1', isRead: false });
    const client: FakeRealtimeNotificationClient = makeFakeRealtimeClient([first]);
    const received: SseEnvelope[] = [];

    const sub = client.openStream({
      onEvent: (event) => received.push(event),
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, 'connected');

    client.emitTestEvent(makeSseUiSyncEvent({ resourceType: 'picking' }));
    client.emitTestEvent(makeSseNotificationEvent({ id: 'notif-2' }));
    assert.equal(received.length, 3);

    const countBefore = await client.getUnreadCount();
    assert.equal(countBefore.unreadCount, 2);

    await client.markAsRead('notif-1');
    const afterOne = await client.getUnreadCount();
    assert.equal(afterOne.unreadCount, 1);

    await client.markAllAsRead();
    const afterAll = await client.getUnreadCount();
    assert.equal(afterAll.unreadCount, 0);

    sub.close();
  });
});
