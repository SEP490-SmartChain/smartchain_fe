import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  HttpRealtimeNotificationClient,
  type RealtimeHttpTransport,
} from '@/features/realtime-notifications/runtime';
import { makeNotificationDto, type SseEnvelope } from '@/features/realtime-notifications/shared';
import type { CreateFetchSseStreamOptions } from '@/features/realtime-notifications/features/realtime-engine';

describe('Wave 3 FE HttpRealtimeNotificationClient (C11)', () => {
  test('unwraps TransformInterceptor list + meta.pagination and pairs unread-count', async () => {
    const sample = makeNotificationDto({ id: 'notif-1', isRead: false });
    const transport: RealtimeHttpTransport = {
      async get<T>(endpoint: string) {
        if (endpoint === '/v1/notifications') {
          return {
            success: true,
            data: [sample],
            meta: {
              pagination: { limit: 30, hasNext: false, nextCursor: null },
            },
          } as unknown as T;
        }
        return {
          success: true,
          data: { unreadCount: 4 },
        } as unknown as T;
      },
      async post(): Promise<never> {
        throw new Error('unused');
      },
    };

    const client = new HttpRealtimeNotificationClient({
      transport,
      baseUrl: '/api',
    });

    const page = await client.listNotifications({ limit: 30, unreadOnly: true });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, 'notif-1');
    assert.equal(page.unreadCount, 4);
    assert.equal(page.pagination.limit, 30);
    assert.equal(page.pagination.hasNext, false);
  });

  test('handles nested NotificationListResponse and markRead/markAllRead envelopes', async () => {
    const sample = makeNotificationDto({ id: 'notif-2', isRead: false });
    const calls: string[] = [];
    const transport: RealtimeHttpTransport = {
      async get<T>(endpoint: string) {
        calls.push(`GET:${endpoint}`);
        return {
          success: true,
          data: {
            items: [sample],
            unreadCount: 1,
            pagination: { limit: 20, hasNext: false, nextCursor: null },
          },
        } as unknown as T;
      },
      async post<T>(endpoint: string) {
        calls.push(`POST:${endpoint}`);
        if (endpoint.endsWith('/read-all')) {
          return {
            success: true,
            data: { markedCount: 1, unreadCount: 0 },
          } as unknown as T;
        }
        return {
          success: true,
          data: {
            id: 'notif-2',
            readAt: '2026-11-24T04:10:00.000Z',
            unreadCount: 0,
          },
        } as unknown as T;
      },
    };

    const client = new HttpRealtimeNotificationClient({ transport });
    const list = await client.listNotifications();
    assert.equal(list.items.length, 1);
    assert.equal(list.unreadCount, 1);

    const readRes = await client.markAsRead('notif-2');
    assert.equal(readRes.unreadCount, 0);

    const allRes = await client.markAllAsRead();
    assert.equal(allRes.markedCount, 1);
    assert.deepEqual(calls, [
      'GET:/v1/notifications',
      'POST:/v1/notifications/notif-2/read',
      'POST:/v1/notifications/read-all',
    ]);
  });

  test('openStream configures stream URL, bearer getter, and 401 refresh hook', async () => {
    let captured: CreateFetchSseStreamOptions | null = null;
    let currentToken = 'token-v1';
    let refreshCount = 0;

    const client = new HttpRealtimeNotificationClient({
      baseUrl: 'https://api.orca.local/api/',
      tokenSource: {
        getAccessToken: () => currentToken,
        refreshSession: async () => {
          refreshCount += 1;
          currentToken = 'token-v2';
        },
      },
      streamFactory: (opts) => {
        captured = opts;
        return { close: () => {} };
      },
    });

    const events: SseEnvelope[] = [];
    const sub = client.openStream({
      onEvent: (evt) => events.push(evt),
    });

    const opts = captured as CreateFetchSseStreamOptions | null;
    if (!opts) {
      throw new Error('Expected openStream to invoke streamFactory');
    }
    assert.equal(opts.url, 'https://api.orca.local/api/v1/notifications/stream');
    assert.equal(opts.getAccessToken(), 'token-v1');
    const refreshed = await opts.refreshAccessToken?.();
    assert.equal(refreshCount, 1);
    assert.equal(refreshed, 'token-v2');
    sub.close();
  });
});
