import { apiClient } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

import {
  createFetchSseStream,
  type CreateFetchSseStreamOptions,
} from '../features/realtime-engine';
import {
  REALTIME_API_PATHS,
  type CursorPaginationMeta,
  type InAppNotificationDto,
  type MarkAllReadResponse,
  type MarkReadResponse,
  type NotificationListQuery,
  type NotificationListResponse,
  type RealtimeClientPort,
  type RealtimeStreamHandlers,
  type RealtimeStreamSubscription,
  type UnreadCountResponse,
} from '../shared';

export interface RealtimeTransportOptions {
  readonly params?: Record<string, string>;
  readonly silent?: boolean;
}

export interface RealtimeEnvelopeMeta {
  readonly pagination?: CursorPaginationMeta;
}

export interface RealtimeHttpEnvelope<T> {
  readonly success?: boolean;
  readonly data?: T;
  readonly meta?: RealtimeEnvelopeMeta;
}

export interface RealtimeHttpTransport {
  get<T>(
    endpoint: string,
    options?: RealtimeTransportOptions,
  ): Promise<T | RealtimeHttpEnvelope<T>>;
  post<T>(
    endpoint: string,
    body: unknown,
    options?: RealtimeTransportOptions,
  ): Promise<T | RealtimeHttpEnvelope<T>>;
}

export interface RealtimeAuthTokenSource {
  getAccessToken(): string | null;
  refreshSession(): Promise<void>;
}

const DEFAULT_PAGINATION: CursorPaginationMeta = {
  limit: 20,
  hasNext: false,
  nextCursor: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapEnvelope<T>(payload: T | RealtimeHttpEnvelope<T>): {
  readonly data: unknown;
  readonly meta?: RealtimeEnvelopeMeta;
} {
  if (isRecord(payload) && payload['success'] === true && 'data' in payload) {
    return {
      data: payload['data'],
      meta: isRecord(payload['meta']) ? (payload['meta'] as RealtimeEnvelopeMeta) : undefined,
    };
  }
  return { data: payload };
}

function defaultBaseUrl(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
      ? String(import.meta.env.VITE_API_URL)
      : '/api';
  return raw.replace(/\/$/, '');
}

const defaultTokenSource: RealtimeAuthTokenSource = {
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshSession: () => apiClient.refreshSession(),
};

export interface HttpRealtimeNotificationClientOptions {
  readonly transport?: RealtimeHttpTransport;
  readonly baseUrl?: string;
  readonly tokenSource?: RealtimeAuthTokenSource;
  readonly streamFactory?: (options: CreateFetchSseStreamOptions) => RealtimeStreamSubscription;
}

/**
 * Runtime FE client connecting NotificationCenter REST endpoints (`apiClient`)
 * and live SSE stream (`createFetchSseStream`). Handles both standard NestJS
 * `TransformInterceptor` list envelopes (`{ success, data: items[], meta.pagination }`)
 * and nested `{ items, unreadCount, pagination }` payloads.
 */
export class HttpRealtimeNotificationClient implements RealtimeClientPort {
  private readonly transport: RealtimeHttpTransport;
  private readonly baseUrl: string;
  private readonly tokenSource: RealtimeAuthTokenSource;
  private readonly streamFactory: (
    options: CreateFetchSseStreamOptions,
  ) => RealtimeStreamSubscription;

  constructor(options: HttpRealtimeNotificationClientOptions = {}) {
    this.transport = options.transport ?? apiClient;
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
    this.tokenSource = options.tokenSource ?? defaultTokenSource;
    this.streamFactory = options.streamFactory ?? createFetchSseStream;
  }

  async listNotifications(query: NotificationListQuery = {}): Promise<NotificationListResponse> {
    const params: Record<string, string> = {};
    if (query.cursor) params['cursor'] = query.cursor;
    if (query.limit !== undefined) params['limit'] = String(query.limit);
    if (query.unreadOnly !== undefined) {
      params['unreadOnly'] = String(query.unreadOnly);
    }
    if (query.category) params['category'] = query.category;

    const raw = await this.transport.get<
      NotificationListResponse | readonly InAppNotificationDto[]
    >(REALTIME_API_PATHS.LIST, { params, silent: true });

    const { data, meta } = unwrapEnvelope(raw);
    if (Array.isArray(data)) {
      const { unreadCount } = await this.getUnreadCount();
      return {
        items: data as readonly InAppNotificationDto[],
        unreadCount,
        pagination: meta?.pagination ?? {
          limit: query.limit ?? DEFAULT_PAGINATION.limit,
          hasNext: false,
          nextCursor: null,
        },
      };
    }

    if (isRecord(data) && Array.isArray(data['items'])) {
      const items = data['items'] as readonly InAppNotificationDto[];
      const unreadCount =
        typeof data['unreadCount'] === 'number'
          ? data['unreadCount']
          : (await this.getUnreadCount()).unreadCount;
      const pagination = isRecord(data['pagination'])
        ? (data['pagination'] as unknown as CursorPaginationMeta)
        : (meta?.pagination ?? DEFAULT_PAGINATION);
      return { items, unreadCount, pagination };
    }

    return {
      items: [],
      unreadCount: 0,
      pagination: DEFAULT_PAGINATION,
    };
  }

  async getUnreadCount(): Promise<UnreadCountResponse> {
    const raw = await this.transport.get<UnreadCountResponse>(REALTIME_API_PATHS.UNREAD_COUNT, {
      silent: true,
    });
    const { data } = unwrapEnvelope(raw);
    if (isRecord(data) && typeof data['unreadCount'] === 'number') {
      return { unreadCount: data['unreadCount'] };
    }
    return { unreadCount: 0 };
  }

  async markAsRead(id: string): Promise<MarkReadResponse> {
    const raw = await this.transport.post<MarkReadResponse>(
      REALTIME_API_PATHS.markRead(id),
      {},
      { silent: true },
    );
    const { data } = unwrapEnvelope(raw);
    return data as MarkReadResponse;
  }

  async markAllAsRead(): Promise<MarkAllReadResponse> {
    const raw = await this.transport.post<MarkAllReadResponse>(
      REALTIME_API_PATHS.READ_ALL,
      {},
      { silent: true },
    );
    const { data } = unwrapEnvelope(raw);
    return data as MarkAllReadResponse;
  }

  openStream(handlers: RealtimeStreamHandlers): RealtimeStreamSubscription {
    return this.streamFactory({
      url: `${this.baseUrl}${REALTIME_API_PATHS.STREAM}`,
      getAccessToken: () => this.tokenSource.getAccessToken(),
      refreshAccessToken: async () => {
        try {
          await this.tokenSource.refreshSession();
          return this.tokenSource.getAccessToken();
        } catch {
          return null;
        }
      },
      handlers,
    });
  }
}

export const httpRealtimeNotificationClient = new HttpRealtimeNotificationClient();
