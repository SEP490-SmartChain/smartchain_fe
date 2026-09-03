import { toast } from 'sonner';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
  requiresAuth?: boolean;
}

class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || '/api';
  }

  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, requiresAuth: _requiresAuth = true, headers, ...customConfig } = options;

    let url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const config: RequestInit = {
      ...customConfig,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let errorMessage = 'Có lỗi xảy ra khi gọi API';
        if (data.error && typeof data.error === 'object' && data.error.message) {
          errorMessage = data.error.message;
        } else if (typeof data.message === 'string') {
          errorMessage = data.message;
        } else if (typeof data.error === 'string') {
          errorMessage = data.error;
        }
        throw new Error(errorMessage);
      }

      return data as T;
    } catch (error) {
      console.error('[API Error]:', error);

      // Global error toast notification
      const message = error instanceof Error ? error.message : 'Lỗi kết nối máy chủ';
      toast.error(message);

      throw error;
    }
  }

  get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
