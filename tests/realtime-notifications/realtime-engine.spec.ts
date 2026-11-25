import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  C07_HOOKS,
  C07_STORES,
  FetchSseClient,
  connectRealtimeEngine,
  createFetchSseStream,
  createSseEnvelopeParser,
  createSseFrameParser,
  parseSseEnvelope,
  parseSseLines,
  subscribeDebouncedUiSync,
  subscribeUiSync,
  useIsRealtimeConnected,
  useNotificationStore,
  useRealtimeConnection,
  useRealtimeSync,
  type FetchLike,
  type SseFrame,
} from '@/features/realtime-notifications/features/realtime-engine';
import {
  REALTIME_SYNC_AREAS,
  REALTIME_TOPICS,
  makeCommercialContractSignedEvent,
  makeCommercialPaymentPostedEvent,
  makeCommercialServiceActivatedEvent,
  makeFakeRealtimeClient,
  makeNotificationDto,
  makeSseNotificationEvent,
  makeSseUiSyncEvent,
  type InAppNotificationDto,
  type RealtimeConnectionStatus,
  type RealtimeUiSyncPayload,
  type SseEnvelope,
} from '@/features/realtime-notifications/shared';

interface ScheduledTimer {
  readonly id: number;
  readonly delayMs: number;
  readonly callback: () => void;
  cleared: boolean;
}

function createFakeTimerDriver() {
  let nextId = 1;
  const timers: ScheduledTimer[] = [];

  const setTimeoutFake = (callback: () => void, delayMs: number): number => {
    const id = nextId++;
    timers.push({ id, delayMs, callback, cleared: false });
    return id;
  };

  const clearTimeoutFake = (handle: unknown): void => {
    const target = timers.find((timer) => timer.id === handle);
    if (target) {
      target.cleared = true;
    }
  };

  const pendingTimers = () => timers.filter((timer) => !timer.cleared);

  const runNext = (): boolean => {
    const next = timers.find((timer) => !timer.cleared);
    if (!next) {
      return false;
    }
    next.cleared = true;
    next.callback();
    return true;
  };

  return {
    timers,
    pendingTimers,
    runNext,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
  };
}

function createSseResponse(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createControllableSseResponse() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    push(chunk: string) {
      controllerRef?.enqueue(encoder.encode(chunk));
    },
    end() {
      controllerRef?.close();
    },
  };
}

async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

function normalizeHeaders(headersInit?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  const headers = new Headers(headersInit);
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

describe('C07 public barrel exports', () => {
  test('publishes C07_STORES and C07_HOOKS tuples', () => {
    assert.deepEqual([...C07_STORES], [useNotificationStore]);
    assert.deepEqual(
      [...C07_HOOKS],
      [useRealtimeConnection, useRealtimeSync, useIsRealtimeConnected],
    );
  });
});

describe('sseParser', () => {
  test('parses arbitrary chunk splits, CRLF across chunk boundaries, comments, and multiline data', () => {
    const frames: SseFrame[] = [];
    const parser = createSseFrameParser((frame) => {
      frames.push(frame);
    });

    const connected = JSON.stringify({
      type: 'connected',
      serverTime: '2026-11-24T04:00:00.000Z',
      unreadCount: 3,
    });
    const payment = makeCommercialPaymentPostedEvent();
    const paymentJson = JSON.stringify(payment);
    const splitPoint = Math.floor(paymentJson.length / 2);

    const streamChunks = [
      '\uFEFF: initial keepalive comment\r',
      '\nid: evt-1\r\nevent: connected\r\ndata: ',
      connected,
      '\r',
      '\n\r',
      '\n',
      ': heartbeat comment between frames\n',
    ];

    for (const chunk of streamChunks) {
      parser.feed(chunk);
    }

    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.id, 'evt-1');
    assert.equal(frames[0]?.event, 'connected');
    assert.equal(parser.getLastEventId(), 'evt-1');

    // Now test standard multiline `data:` joined by `\n` and flushed on blank line.
    const multilineFrames: SseFrame[] = [];
    const multiParser = createSseFrameParser((frame) => {
      multilineFrames.push(frame);
    });
    multiParser.feed('id: evt-multi\nevent: message\ndata: line one\n');
    multiParser.feed('data: line two\n');
    assert.equal(multilineFrames.length, 0);
    multiParser.feed('\n');
    assert.equal(multilineFrames.length, 1);
    assert.deepEqual(multilineFrames[0], {
      id: 'evt-multi',
      event: 'message',
      data: 'line one\nline two',
    });

    // Feed a complete single-line notification JSON payload split across arbitrary chunks.
    const notifFrames: SseFrame[] = [];
    const notifParser = createSseFrameParser((frame) => {
      notifFrames.push(frame);
    });
    notifParser.feed(`id: evt-2\nevent: notification\ndata: ${paymentJson.slice(0, splitPoint)}`);
    notifParser.feed(`${paymentJson.slice(splitPoint)}\n\n`);
    assert.equal(notifFrames.length, 1);
    const parsedPayment = parseSseEnvelope(notifFrames[0]!);
    assert.equal(parsedPayment?.type, 'notification');
    if (parsedPayment?.type === 'notification') {
      assert.equal(parsedPayment.notification.id, payment.notification.id);
      assert.deepEqual(parsedPayment.uiSync?.syncAreas, payment.uiSync?.syncAreas);
    }
  });

  test('decodes connected, notification, ui_sync, and heartbeat envelopes and ignores malformed JSON safely', () => {
    const envelopes: SseEnvelope[] = [];
    const invalidFrames: SseFrame[] = [];
    const parser = createSseEnvelopeParser(
      (envelope) => envelopes.push(envelope),
      (frame) => invalidFrames.push(frame),
    );

    const uiSyncEvent = makeSseUiSyncEvent({
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_BILLING],
      resourceType: 'invoice',
    });
    const notifEvent = makeSseNotificationEvent({ id: 'notif-valid-1' });

    const payload = [
      'event: connected',
      'id: 1',
      'data: {"type":"connected","serverTime":"2026-11-24T04:00:00.000Z","unreadCount":4}',
      '',
      ': keepalive comment should be ignored',
      'event: notification',
      'id: 2',
      'data: {broken-json',
      '',
      'event: ui_sync',
      'id: 3',
      `data: ${JSON.stringify(uiSyncEvent)}`,
      '',
      'event: heartbeat',
      'data: {"type":"heartbeat","serverTime":"2026-11-24T04:00:15.000Z"}',
      '',
      'event: notification',
      'id: 4',
      `data: ${JSON.stringify(notifEvent)}`,
      '',
      'event: notification',
      'data: {"type":"notification","notification":{"bad":true}}',
      '',
      '',
    ].join('\n');

    // Feed character-by-character in small uneven slices to exercise split resiliency.
    for (let i = 0; i < payload.length; i += 7) {
      parser.feed(payload.slice(i, i + 7));
    }
    parser.flush();

    assert.equal(invalidFrames.length, 2);
    assert.equal(envelopes.length, 4);
    assert.equal(envelopes[0]?.type, 'connected');
    assert.equal(envelopes[1]?.type, 'ui_sync');
    assert.equal(envelopes[2]?.type, 'heartbeat');
    assert.equal(envelopes[3]?.type, 'notification');
    assert.equal(parser.getLastEventId(), '4');
  });

  test('parseSseLines supports string and line-array inputs', () => {
    const lines = ['id: 10', 'event: ui_sync', `data: ${JSON.stringify(makeSseUiSyncEvent())}`, ''];
    const fromArray = parseSseLines(lines);
    const fromString = parseSseLines(`${lines.join('\n')}\n`);
    assert.equal(fromArray.length, 1);
    assert.deepEqual(fromArray, fromString);
  });
});

describe('fetchSseClient', () => {
  test('sends required headers/credentials, handles 401 refresh + single retry, and resumes with Last-Event-ID', async () => {
    const statuses: RealtimeConnectionStatus[] = [];
    const events: SseEnvelope[] = [];
    const recordedRequests: Array<{
      url: string;
      headers: Record<string, string>;
      credentials?: RequestCredentials;
    }> = [];

    let currentToken = 'expired-token';
    let refreshCalls = 0;
    let fetchAttempt = 0;

    const controllable = createControllableSseResponse();
    const fetchImpl: FetchLike = async (input, init) => {
      fetchAttempt += 1;
      recordedRequests.push({
        url: String(input),
        headers: normalizeHeaders(init?.headers),
        credentials: init?.credentials,
      });

      if (fetchAttempt === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      if (fetchAttempt === 2) {
        return controllable.response;
      }
      return createSseResponse([
        'id: evt-20\nevent: heartbeat\ndata: {"type":"heartbeat","serverTime":"2026-11-24T04:01:00.000Z"}\n\n',
      ]);
    };

    const timerDriver = createFakeTimerDriver();
    const sub = createFetchSseStream({
      url: '/api/v1/notifications/stream',
      initialLastEventId: 'evt-0',
      getAccessToken: () => currentToken,
      refreshAccessToken: async () => {
        refreshCalls += 1;
        currentToken = 'fresh-token';
        return currentToken;
      },
      fetchImpl,
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitterRatio: 0,
      handlers: {
        onEvent: (event) => events.push(event),
        onStatusChange: (status) => statuses.push(status),
      },
    });

    await flushMicrotasks();

    assert.equal(refreshCalls, 1);
    assert.equal(fetchAttempt, 2);
    assert.equal(recordedRequests[0]?.headers.authorization, 'Bearer expired-token');
    assert.equal(recordedRequests[0]?.headers.accept, 'text/event-stream');
    assert.equal(recordedRequests[0]?.headers['last-event-id'], 'evt-0');
    assert.equal(recordedRequests[0]?.credentials, 'include');
    assert.equal(recordedRequests[1]?.headers.authorization, 'Bearer fresh-token');
    assert.deepEqual(statuses, ['connecting', 'connected']);

    controllable.push(
      'id: evt-10\nevent: connected\ndata: {"type":"connected","serverTime":"2026-11-24T04:00:00.000Z","unreadCount":2}\n\n',
    );
    await flushMicrotasks();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, 'connected');

    // Unexpected EOF schedules reconnect with Last-Event-ID updated to evt-10.
    controllable.end();
    await flushMicrotasks();
    assert.equal(statuses.at(-1), 'reconnecting');
    assert.equal(timerDriver.pendingTimers().length, 1);
    assert.equal(timerDriver.pendingTimers()[0]?.delayMs, 100);

    timerDriver.runNext();
    await flushMicrotasks();
    assert.equal(fetchAttempt, 3);
    assert.equal(recordedRequests[2]?.headers['last-event-id'], 'evt-10');

    sub.close();
    assert.equal(statuses.at(-1), 'disconnected');
  });

  test('supports void-returning refreshAccessToken by re-reading getAccessToken()', async () => {
    let token = 'old-jwt';
    let attempts = 0;
    const seenAuthHeaders: string[] = [];

    const sub = createFetchSseStream({
      url: '/api/v1/notifications/stream',
      getAccessToken: () => token,
      refreshAccessToken: async () => {
        token = 'rotated-jwt';
      },
      fetchImpl: async (_input, init) => {
        attempts += 1;
        seenAuthHeaders.push(normalizeHeaders(init?.headers).authorization ?? '');
        if (attempts === 1) {
          return new Response('Unauthorized', { status: 401 });
        }
        return createControllableSseResponse().response;
      },
      handlers: {
        onEvent: () => {},
      },
    });

    await flushMicrotasks();
    assert.deepEqual(seenAuthHeaders, ['Bearer old-jwt', 'Bearer rotated-jwt']);
    sub.close();
  });

  test('stops permanently on 403 without refreshing or scheduling reconnects', async () => {
    const statuses: RealtimeConnectionStatus[] = [];
    const errors: Error[] = [];
    let refreshCalls = 0;
    const timerDriver = createFakeTimerDriver();

    const client = new FetchSseClient({
      url: '/api/v1/notifications/stream',
      getAccessToken: () => 'valid-token',
      refreshAccessToken: async () => {
        refreshCalls += 1;
        return 'other-token';
      },
      fetchImpl: async () => new Response('Forbidden', { status: 403 }),
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
    });

    client.open({
      onEvent: () => {},
      onStatusChange: (status) => statuses.push(status),
      onError: (error) => errors.push(error),
    });

    await flushMicrotasks();

    assert.equal(refreshCalls, 0);
    assert.equal(timerDriver.timers.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.message, /403/);
    assert.deepEqual(statuses, ['connecting', 'disconnected']);
  });

  test('stops permanently when 401 persists after single token refresh', async () => {
    const statuses: RealtimeConnectionStatus[] = [];
    const errors: Error[] = [];
    let refreshCalls = 0;
    let fetchCalls = 0;
    const timerDriver = createFakeTimerDriver();

    createFetchSseStream({
      url: '/api/v1/notifications/stream',
      getAccessToken: () => 'stale-token',
      refreshAccessToken: async () => {
        refreshCalls += 1;
        return 'still-rejected-token';
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response('Unauthorized', { status: 401 });
      },
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
      handlers: {
        onEvent: () => {},
        onStatusChange: (status) => statuses.push(status),
        onError: (error) => errors.push(error),
      },
    });

    await flushMicrotasks();

    assert.equal(refreshCalls, 1);
    assert.equal(fetchCalls, 2);
    assert.equal(timerDriver.timers.length, 0);
    assert.equal(errors.length, 1);
    assert.deepEqual(statuses, ['connecting', 'disconnected']);
  });

  test('applies exponential backoff with jitter on 5xx/network errors and cleans up on close()', async () => {
    const statuses: RealtimeConnectionStatus[] = [];
    const errors: Error[] = [];
    const timerDriver = createFakeTimerDriver();
    const observedDelays: number[] = [];
    const capturedSignals: AbortSignal[] = [];

    let callIndex = 0;
    const fetchImpl: FetchLike = async (_input, init) => {
      if (init?.signal) {
        capturedSignals.push(init.signal);
      }
      callIndex += 1;
      if (callIndex === 1) {
        return new Response('Server Error', { status: 503 });
      }
      if (callIndex === 2) {
        throw new Error('ECONNRESET');
      }
      if (callIndex === 3) {
        return new Response('Bad Gateway', { status: 502 });
      }
      // Fourth attempt stays open until aborted by close().
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };

    const subscription = createFetchSseStream({
      url: '/api/v1/notifications/stream',
      getAccessToken: () => 'token-1',
      fetchImpl,
      setTimeout: (cb, delayMs) => {
        observedDelays.push(delayMs);
        return timerDriver.setTimeout(cb, delayMs);
      },
      clearTimeout: timerDriver.clearTimeout,
      baseDelayMs: 100,
      maxDelayMs: 350,
      jitterRatio: 0.2,
      random: () => 0.5, // factor = 1 - 0.2 + 0.5 * 0.2 = 0.9
      handlers: {
        onEvent: () => {},
        onStatusChange: (status) => statuses.push(status),
        onError: (error) => errors.push(error),
      },
    });

    await flushMicrotasks();
    assert.equal(observedDelays[0], 90); // 100 * 0.9
    assert.equal(statuses.at(-1), 'reconnecting');

    timerDriver.runNext();
    await flushMicrotasks();
    assert.equal(observedDelays[1], 180); // 200 * 0.9

    timerDriver.runNext();
    await flushMicrotasks();
    assert.equal(observedDelays[2], 315); // min(350, 400) * 0.9

    // Trigger 4th attempt (pending fetch) and immediately close() to verify AbortController cleanup.
    timerDriver.runNext();
    await flushMicrotasks();
    assert.equal(callIndex, 4);
    assert.equal(capturedSignals[3]?.aborted, false);

    subscription.close();
    await flushMicrotasks();

    assert.equal(capturedSignals[3]?.aborted, true);
    assert.equal(statuses.at(-1), 'disconnected');
    assert.equal(errors.length, 3);
    assert.equal(timerDriver.pendingTimers().length, 0);
  });

  test('cancels pending backoff timer when close() is called while waiting to reconnect', async () => {
    const timerDriver = createFakeTimerDriver();
    const statuses: RealtimeConnectionStatus[] = [];

    const subscription = createFetchSseStream({
      url: '/api/v1/notifications/stream',
      getAccessToken: () => 'token-1',
      fetchImpl: async () => new Response('Unavailable', { status: 503 }),
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
      baseDelayMs: 500,
      jitterRatio: 0,
      handlers: {
        onEvent: () => {},
        onStatusChange: (status) => statuses.push(status),
      },
    });

    await flushMicrotasks();
    assert.equal(timerDriver.pendingTimers().length, 1);

    subscription.close();
    assert.equal(timerDriver.pendingTimers().length, 0);
    assert.equal(statuses.at(-1), 'disconnected');
  });
});

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset();
  });

  test('hydrates newest-first while preserving already-pushed live notifications', () => {
    const store = useNotificationStore.getState();
    const liveItem = makeNotificationDto({
      id: 'live-newest',
      createdAt: '2026-11-24T04:10:00.000Z',
      isRead: false,
    });
    const olderItem = makeNotificationDto({
      id: 'server-older',
      createdAt: '2026-11-24T03:00:00.000Z',
      isRead: false,
    });
    const middleItem = makeNotificationDto({
      id: 'server-middle',
      createdAt: '2026-11-24T04:05:00.000Z',
      isRead: true,
      readAt: '2026-11-24T04:06:00.000Z',
    });

    store.applyIncomingNotification(liveItem);
    store.hydrateInitial({
      items: [olderItem, middleItem],
      unreadCount: 1,
    });

    const state = useNotificationStore.getState();
    assert.equal(state.hydrated, true);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ['live-newest', 'server-middle', 'server-older'],
    );
    assert.equal(state.unreadCount, 2);
  });

  test('deduplicates incoming notifications by id and manages unreadCount transitions across markReadLocal, markAllReadLocal, and reset', () => {
    const store = useNotificationStore.getState();
    store.applyConnected({ unreadCount: 0 });
    assert.equal(useNotificationStore.getState().connectionStatus, 'connected');

    const first = makeNotificationDto({ id: 'notif-1', isRead: false });
    const alreadyRead = makeNotificationDto({
      id: 'notif-2',
      isRead: true,
      readAt: '2026-11-24T04:01:00.000Z',
    });
    const third = makeNotificationDto({ id: 'notif-3', isRead: false });

    store.applyIncomingNotification(first);
    // Duplicate id must not add a second item or double-count unread.
    store.applyIncomingNotification(first);
    store.applyIncomingNotification(alreadyRead);
    store.applyIncomingNotification(third);

    let state = useNotificationStore.getState();
    assert.equal(state.items.length, 3);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ['notif-3', 'notif-2', 'notif-1'],
    );
    assert.equal(state.unreadCount, 2);

    // Mark read without server unreadCount decrements cleanly.
    store.markReadLocal('notif-1', '2026-11-24T04:08:00.000Z');
    state = useNotificationStore.getState();
    assert.equal(state.unreadCount, 1);
    assert.equal(state.items.find((item) => item.id === 'notif-1')?.isRead, true);

    // Repeated markReadLocal on an already-read item does not decrement again.
    store.markReadLocal('notif-1', '2026-11-24T04:09:00.000Z');
    assert.equal(useNotificationStore.getState().unreadCount, 1);

    // Server-authoritative unreadCount overrides when provided.
    store.markReadLocal('notif-3', '2026-11-24T04:10:00.000Z', 5);
    assert.equal(useNotificationStore.getState().unreadCount, 5);

    store.markAllReadLocal('2026-11-24T04:11:00.000Z');
    state = useNotificationStore.getState();
    assert.equal(state.unreadCount, 0);
    assert.equal(
      state.items.every((item) => item.isRead),
      true,
    );

    store.reset();
    state = useNotificationStore.getState();
    assert.deepEqual(state.items, []);
    assert.equal(state.unreadCount, 0);
    assert.equal(state.connectionStatus, 'idle');
    assert.deepEqual(state.lastUiSyncByArea, {});
    assert.equal(state.hydrated, false);
  });

  test('dispatches subscribeUiSync only to matching sync areas and records lastUiSyncByArea', () => {
    const billingEvents: RealtimeUiSyncPayload[] = [];
    const profileEvents: RealtimeUiSyncPayload[] = [];
    const inboundEvents: RealtimeUiSyncPayload[] = [];

    const unsubBilling = useNotificationStore
      .getState()
      .subscribeUiSync(REALTIME_SYNC_AREAS.COMMERCIAL_BILLING, (payload) => {
        billingEvents.push(payload);
      });
    const unsubProfile = subscribeUiSync([REALTIME_SYNC_AREAS.AUTH_PROFILE], (payload) => {
      profileEvents.push(payload);
    });
    const unsubInbound = subscribeUiSync([REALTIME_SYNC_AREAS.INBOUND_ASN], (payload) => {
      inboundEvents.push(payload);
    });

    try {
      const paymentEvent = makeCommercialPaymentPostedEvent();
      useNotificationStore
        .getState()
        .applyIncomingNotification(paymentEvent.notification, paymentEvent.uiSync);

      assert.equal(billingEvents.length, 1);
      assert.equal(profileEvents.length, 0);
      assert.equal(inboundEvents.length, 0);

      const activatedEvent = makeCommercialServiceActivatedEvent();
      useNotificationStore.getState().applyUiSync(activatedEvent.uiSync!);

      assert.equal(billingEvents.length, 2);
      assert.equal(profileEvents.length, 1);
      assert.equal(inboundEvents.length, 0);

      const byArea = useNotificationStore.getState().lastUiSyncByArea;
      assert.equal(
        byArea[REALTIME_SYNC_AREAS.COMMERCIAL_BILLING]?.topic,
        REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED,
      );
      assert.equal(
        byArea[REALTIME_SYNC_AREAS.AUTH_PROFILE]?.topic,
        REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED,
      );
      assert.equal(byArea[REALTIME_TOPICS.COMMERCIAL_SERVICE_ACTIVATED]?.resourceType, 'tenant');
      assert.equal(byArea.tenant?.status, 'ACTIVE');
    } finally {
      unsubBilling();
      unsubProfile();
      unsubInbound();
    }

    // Unsubscribed listeners must no longer fire.
    useNotificationStore.getState().applyUiSync(makeCommercialContractSignedEvent().uiSync!);
    assert.equal(billingEvents.length, 2);
  });
});

describe('connection controller & debounced UI sync', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset();
  });

  test('connectRealtimeEngine hydrates, streams, deduplicates toast callbacks, and resets on dispose', async () => {
    const initial = makeNotificationDto({ id: 'initial-1', isRead: false });
    const client = makeFakeRealtimeClient([initial]);
    const toasted: InAppNotificationDto[] = [];
    const synced: RealtimeUiSyncPayload[] = [];

    const cleanup = connectRealtimeEngine({
      client,
      authScopeKey: 'user-1:tenant-1',
      initialListLimit: 30,
      onNotification: (notification) => toasted.push(notification),
      onUiSync: (uiSync) => synced.push(uiSync),
    });

    await flushMicrotasks();

    let state = useNotificationStore.getState();
    assert.equal(state.hydrated, true);
    assert.equal(state.connectionStatus, 'connected');
    assert.equal(state.unreadCount, 1);
    assert.equal(state.items.length, 1);

    const signed = makeCommercialContractSignedEvent();
    client.emitTestEvent(signed);
    // Duplicate push of same notification id must not fire duplicate toast.
    client.emitTestEvent(signed);

    state = useNotificationStore.getState();
    assert.equal(toasted.length, 1);
    assert.equal(toasted[0]?.id, signed.notification.id);
    assert.equal(synced.length, 2);
    assert.equal(state.unreadCount, 2);

    cleanup();
    state = useNotificationStore.getState();
    assert.equal(state.connectionStatus, 'idle');
    assert.equal(state.items.length, 0);
    assert.equal(state.unreadCount, 0);
  });

  test('subscribeDebouncedUiSync collapses bursts and cancels pending timers on dispose', () => {
    const timerDriver = createFakeTimerDriver();
    const received: RealtimeUiSyncPayload[] = [];

    const unsubscribe = subscribeDebouncedUiSync({
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_BILLING],
      debounceMs: 120,
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
      onSync: (uiSync) => {
        received.push(uiSync);
      },
    });

    const firstSync = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.INVOICE_ISSUED,
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_BILLING],
      resourceId: 'inv-1',
    }).uiSync;
    const secondSync = makeSseUiSyncEvent({
      topic: REALTIME_TOPICS.COMMERCIAL_PAYMENT_POSTED,
      syncAreas: [REALTIME_SYNC_AREAS.COMMERCIAL_BILLING],
      resourceId: 'inv-2',
    }).uiSync;

    useNotificationStore.getState().applyUiSync(firstSync);
    useNotificationStore.getState().applyUiSync(secondSync);

    assert.equal(received.length, 0);
    assert.equal(timerDriver.pendingTimers().length, 1);
    assert.equal(timerDriver.pendingTimers()[0]?.delayMs, 120);

    timerDriver.runNext();
    assert.equal(received.length, 1);
    assert.equal(received[0]?.resourceId, 'inv-2');

    // Trigger another event then unsubscribe before debounce fires -> cancelled cleanly.
    useNotificationStore.getState().applyUiSync(firstSync);
    assert.equal(timerDriver.pendingTimers().length, 1);
    unsubscribe();
    assert.equal(timerDriver.pendingTimers().length, 0);

    // Zero debounce delivers synchronously without scheduling timers.
    const immediateReceived: RealtimeUiSyncPayload[] = [];
    const unsubImmediate = subscribeDebouncedUiSync({
      syncAreas: REALTIME_SYNC_AREAS.COMMERCIAL_BILLING,
      debounceMs: 0,
      setTimeout: timerDriver.setTimeout,
      clearTimeout: timerDriver.clearTimeout,
      onSync: (uiSync) => {
        immediateReceived.push(uiSync);
      },
    });
    useNotificationStore.getState().applyUiSync(secondSync);
    assert.equal(immediateReceived.length, 1);
    assert.equal(immediateReceived[0]?.resourceId, 'inv-2');
    assert.equal(timerDriver.pendingTimers().length, 0);
    unsubImmediate();
  });

  test('hooks render safely during SSR without side effects', () => {
    function Probe() {
      useRealtimeConnection({
        client: null,
        enabled: false,
        authScopeKey: 'anon',
      });
      useRealtimeSync(REALTIME_SYNC_AREAS.COMMERCIAL_BILLING, () => {});
      const connected = useIsRealtimeConnected();
      return createElement('span', null, connected ? 'connected' : 'idle');
    }

    const html = renderToStaticMarkup(createElement(Probe));
    assert.equal(html, '<span>idle</span>');
  });
});
