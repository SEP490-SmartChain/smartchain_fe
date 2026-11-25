import { createSseEnvelopeParser } from './sseParser';
import {
  type RealtimeConnectionStatus,
  type RealtimeStreamHandlers,
  type RealtimeStreamSubscription,
} from '../../shared';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SseTimerHandle = unknown;

export interface FetchSseClientConfig {
  readonly url: string;
  readonly getAccessToken: () => string | null | Promise<string | null>;
  readonly refreshAccessToken?: () => Promise<string | null | void>;
  readonly initialLastEventId?: string | null;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly jitterRatio?: number;
  readonly random?: () => number;
  readonly fetchImpl?: FetchLike;
  readonly setTimeout?: (callback: () => void, delayMs: number) => SseTimerHandle;
  readonly clearTimeout?: (handle: SseTimerHandle) => void;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface CreateFetchSseStreamOptions extends FetchSseClientConfig {
  readonly handlers: RealtimeStreamHandlers;
}

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_JITTER_RATIO = 0.2;

const NON_RETRYABLE_STATUS_CODES = new Set([400, 403, 404, 410, 422]);

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' && error.length > 0 ? error : fallbackMessage);
}

/**
 * Computes exponential backoff delay with bounded jitter so delays stay within
 * `[baseDelay * (1 - jitterRatio), maxDelayMs]`.
 */
export function computeReconnectDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
  random: () => number,
): number {
  const safeBase = Math.max(0, baseDelayMs);
  const safeMax = Math.max(safeBase, maxDelayMs);
  const clampedJitter = Math.min(Math.max(0, jitterRatio), 1);
  const exponential = Math.min(safeMax, safeBase * 2 ** Math.max(0, attempt));
  if (clampedJitter === 0) {
    return Math.round(exponential);
  }
  const sample = Math.min(Math.max(0, random()), 1);
  const factor = 1 - clampedJitter + sample * clampedJitter;
  return Math.max(0, Math.round(exponential * factor));
}

/**
 * Reusable fetch-based SSE transport handling Bearer auth, single-shot 401
 * refresh + retry, immediate stop on 403, Last-Event-ID resumption, and
 * exponential backoff reconnection.
 */
export class FetchSseClient {
  constructor(private readonly config: FetchSseClientConfig) {}

  open(handlers: RealtimeStreamHandlers): RealtimeStreamSubscription {
    return createFetchSseStream({
      ...this.config,
      handlers,
    });
  }
}

/**
 * Opens an SSE stream over `fetch()` and returns a `RealtimeStreamSubscription`
 * whose `close()` aborts in-flight requests and cancels pending reconnect timers.
 */
export function createFetchSseStream(
  options: CreateFetchSseStreamOptions,
): RealtimeStreamSubscription {
  const fetchFn: FetchLike =
    options.fetchImpl ??
    ((input, init) => {
      return globalThis.fetch(input, init);
    });
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const randomFn = options.random ?? Math.random;

  let closed = false;
  let attempt = 0;
  let lastEventId: string | null = options.initialLastEventId ?? null;
  let lastStatus: RealtimeConnectionStatus | null = null;
  let activeController: AbortController | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let cancelPendingTimer: (() => void) | null = null;

  const emitStatus = (status: RealtimeConnectionStatus) => {
    if (lastStatus === status) {
      return;
    }
    lastStatus = status;
    options.handlers.onStatusChange?.(status);
  };

  const clearPendingTimer = () => {
    if (!cancelPendingTimer) {
      return;
    }
    const cancel = cancelPendingTimer;
    cancelPendingTimer = null;
    cancel();
  };

  const scheduleTimer = (callback: () => void, delayMs: number) => {
    clearPendingTimer();
    if (options.setTimeout) {
      const handle = options.setTimeout(callback, delayMs);
      cancelPendingTimer = () => {
        options.clearTimeout?.(handle);
      };
      return;
    }
    const handle = globalThis.setTimeout(callback, delayMs);
    cancelPendingTimer = () => {
      globalThis.clearTimeout(handle);
    };
  };

  const stopPermanently = (error?: Error) => {
    if (closed) {
      return;
    }
    closed = true;
    clearPendingTimer();
    activeController?.abort();
    activeController = null;
    if (activeReader) {
      void activeReader.cancel().catch(() => undefined);
      activeReader = null;
    }
    if (error) {
      options.handlers.onError?.(error);
    }
    emitStatus('disconnected');
  };

  const scheduleReconnect = (error?: Error) => {
    if (closed) {
      return;
    }
    if (error) {
      options.handlers.onError?.(error);
    }
    const delayMs = computeReconnectDelayMs(
      attempt,
      baseDelayMs,
      maxDelayMs,
      jitterRatio,
      randomFn,
    );
    attempt += 1;
    emitStatus('reconnecting');
    scheduleTimer(() => {
      if (!closed) {
        void connectAttempt(false);
      }
    }, delayMs);
  };

  const buildHeaders = (token: string | null): Record<string, string> => {
    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (lastEventId) {
      headers['Last-Event-ID'] = lastEventId;
    }
    return headers;
  };

  const readEventStream = async (
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
  ): Promise<void> => {
    const reader = body.getReader();
    activeReader = reader;
    const decoder = new TextDecoder('utf-8');
    const parser = createSseEnvelopeParser((envelope, frame) => {
      if (closed || controller.signal.aborted) {
        return;
      }
      if (frame.id !== undefined) {
        lastEventId = frame.id;
      }
      attempt = 0;
      options.handlers.onEvent(envelope);
    });

    try {
      while (!closed && !controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          parser.feed(decoder.decode(value, { stream: true }));
        }
      }
      const trailing = decoder.decode();
      if (trailing) {
        parser.feed(trailing);
      }
      parser.flush();
      const parserLastId = parser.getLastEventId();
      if (parserLastId !== null) {
        lastEventId = parserLastId;
      }
    } finally {
      if (activeReader === reader) {
        activeReader = null;
      }
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be cancelled/released when aborted.
      }
    }
  };

  const connectAttempt = async (hasRefreshedToken: boolean, overrideToken?: string | null) => {
    if (closed) {
      return;
    }
    emitStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    const controller = new AbortController();
    activeController = controller;

    try {
      const token = overrideToken !== undefined ? overrideToken : await options.getAccessToken();
      if (closed || controller.signal.aborted) {
        return;
      }

      const response = await fetchFn(options.url, {
        method: 'GET',
        headers: buildHeaders(token),
        credentials: 'include',
        signal: controller.signal,
      });

      if (closed || controller.signal.aborted) {
        return;
      }

      if (response.status === 401) {
        if (!hasRefreshedToken && options.refreshAccessToken) {
          let refreshedResult: string | null | void;
          try {
            refreshedResult = await options.refreshAccessToken();
          } catch (refreshError: unknown) {
            if (!closed) {
              stopPermanently(toError(refreshError, 'Failed to refresh realtime access token'));
            }
            return;
          }
          if (closed || controller.signal.aborted) {
            return;
          }
          const nextToken =
            typeof refreshedResult === 'string' && refreshedResult.length > 0
              ? refreshedResult
              : await options.getAccessToken();
          if (closed || controller.signal.aborted) {
            return;
          }
          if (!nextToken) {
            stopPermanently(new Error('Realtime stream unauthorized (401)'));
            return;
          }
          await connectAttempt(true, nextToken);
          return;
        }
        stopPermanently(new Error('Realtime stream unauthorized (401)'));
        return;
      }

      if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
        stopPermanently(new Error(`Realtime stream rejected with status ${response.status}`));
        return;
      }

      if (!response.ok) {
        scheduleReconnect(new Error(`Realtime stream HTTP error ${response.status}`));
        return;
      }

      if (!response.body) {
        scheduleReconnect(new Error('Realtime stream response body is empty'));
        return;
      }

      emitStatus('connected');
      await readEventStream(response.body, controller);

      if (!closed && !controller.signal.aborted) {
        scheduleReconnect();
      }
    } catch (error: unknown) {
      if (closed || controller.signal.aborted) {
        return;
      }
      scheduleReconnect(toError(error, 'Realtime stream connection failed'));
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  };

  void connectAttempt(false);

  return {
    close: () => {
      stopPermanently();
    },
  };
}
