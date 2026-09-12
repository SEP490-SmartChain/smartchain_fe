import { toast } from 'sonner';
import { z } from 'zod';

import { useAuthStore } from '@/stores/authStore';
import { useLocaleStore } from '@/stores/localeStore';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
  requiresAuth?: boolean;
  silent?: boolean;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: { timestamp: string; path: string; requestId: string };
}

export interface LoginInput {
  email: string;
  password: string;
  rememberSession: boolean;
  workspaceSlug?: string;
}

const profileSchema = z.object({
  userId: z.string(),
  tenantId: z.string().nullable(),
  email: z.string(),
  fullName: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  user: profileSchema,
});
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private baseURL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  private refreshPromise: Promise<void> | null = null;
  private initializationPromise: Promise<void> | null = null;
  private logoutPromise: Promise<void> | null = null;

  private message(vi: string, en: string) {
    return useLocaleStore.getState().locale === 'en' ? en : vi;
  }

  private async send(endpoint: string, options: FetchOptions, token: string | null) {
    const { params, requiresAuth: _auth, silent: _silent, headers, ...config } = options;
    const url = `${this.baseURL}${endpoint}${params ? `?${new URLSearchParams(params)}` : ''}`;
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Content-Type', 'application/json');
    requestHeaders.set('Accept-Language', useLocaleStore.getState().locale);
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
    return fetch(url, {
      ...config,
      credentials: 'include',
      headers: requestHeaders,
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  }

  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { requiresAuth = true, silent = false } = options;
    try {
      if (requiresAuth) {
        const { accessToken, expiresAt } = useAuthStore.getState();
        if (!accessToken || expiresAt <= Date.now() + 5000) await this.refreshSession();
      }
      const token = requiresAuth ? useAuthStore.getState().accessToken : null;
      const revision = useAuthStore.getState().revision;
      let response = await this.send(endpoint, options, token);
      if (requiresAuth && response.status === 401) {
        if (revision !== useAuthStore.getState().revision) {
          throw new ApiError('Session changed', 401, 'AUTH.UNAUTHENTICATED');
        }
        // A parallel request may already have rotated this access token.
        if (useAuthStore.getState().accessToken === token) await this.refreshSession();
        response = await this.send(endpoint, options, useAuthStore.getState().accessToken);
        if (response.status === 401 && revision === useAuthStore.getState().revision) {
          useAuthStore.getState().clear();
        }
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorSchema.safeParse(body);
        throw new ApiError(
          parsed.success
            ? parsed.data.error.message
            : this.message(
                'Không thể gọi API. Vui lòng thử lại.',
                'Unable to reach the API. Please retry.',
              ),
          response.status,
          parsed.success ? parsed.data.error.code : 'HTTP.ERROR',
          parsed.success ? parsed.data.error.details : undefined,
        );
      }
      if (!z.object({ success: z.literal(true), data: z.unknown() }).safeParse(body).success) {
        throw new ApiError(
          this.message('Phản hồi máy chủ không hợp lệ.', 'Invalid server response.'),
          response.status,
          'API.INVALID_RESPONSE',
        );
      }
      return body as T;
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(
              this.message(
                'Không thể kết nối máy chủ. Vui lòng thử lại.',
                'Unable to connect to the server. Please retry.',
              ),
              0,
              'NETWORK.ERROR',
            );
      if (!silent) toast.error(failure.message);
      throw failure;
    }
  }

  refreshSession(): Promise<void> {
    if (this.logoutPromise) {
      return this.logoutPromise.then(() => {
        throw new ApiError('Session ended', 401, 'AUTH.UNAUTHENTICATED');
      });
    }
    if (this.refreshPromise) return this.refreshPromise;
    const revision = useAuthStore.getState().revision;
    this.refreshPromise = this.post<ApiResponse<unknown>>(
      '/v1/auth/refresh',
      {},
      { requiresAuth: false, silent: true },
    )
      .then(({ data }) => {
        if (revision !== useAuthStore.getState().revision) {
          throw new ApiError('Session changed', 401, 'AUTH.UNAUTHENTICATED');
        }
        useAuthStore.getState().setSession(sessionSchema.parse(data));
      })
      .catch((error: unknown) => {
        if (
          revision === useAuthStore.getState().revision &&
          error instanceof ApiError &&
          [401, 403].includes(error.status)
        ) {
          useAuthStore.getState().clear();
        }
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  initializeSession(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    if (['authenticated', 'anonymous'].includes(useAuthStore.getState().status)) {
      return Promise.resolve();
    }
    useAuthStore.setState({ status: 'initializing' });
    this.initializationPromise = this.refreshSession()
      .catch(() => {
        if (useAuthStore.getState().status !== 'anonymous') {
          useAuthStore.setState({ status: 'error' });
        }
      })
      .finally(() => {
        this.initializationPromise = null;
      });
    return this.initializationPromise;
  }

  async login(input: LoginInput) {
    // Settle restoration first so a late refresh cannot overwrite the new login.
    await this.initializationPromise;
    await this.logoutPromise;
    await this.refreshPromise?.catch(() => undefined);
    const { data } = await this.post<ApiResponse<unknown>>('/v1/auth/login', input, {
      requiresAuth: false,
      silent: true,
    });
    const session = sessionSchema.parse(data);
    useAuthStore.getState().clear();
    useAuthStore.getState().setSession(session);
    return session.user;
  }

  logout(): Promise<void> {
    if (this.logoutPromise) return this.logoutPromise;
    // Serialize cookie mutations, including requests that expire during logout.
    const pendingRefresh = this.refreshPromise;
    this.logoutPromise = (async () => {
      await pendingRefresh?.catch(() => undefined);
      await this.post<ApiResponse<null>>('/v1/auth/logout', {}, { requiresAuth: false });
      useAuthStore.getState().clear();
    })().finally(() => {
      this.logoutPromise = null;
    });
    return this.logoutPromise;
  }

  async currentUser() {
    const revision = useAuthStore.getState().revision;
    const { data } = await this.get<ApiResponse<unknown>>('/v1/auth/me');
    if (revision === useAuthStore.getState().revision) {
      useAuthStore.getState().setUser(profileSchema.parse(data));
    }
  }

  get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }
  post<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
  }
  put<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
  }
  patch<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
