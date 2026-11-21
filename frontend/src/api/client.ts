export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | undefined;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServerError(status: number): boolean {
  return status >= 500 && status <= 599;
}

export class ApiClient {
  private baseUrl: string;
  private getToken?: () => string | null | undefined;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.getToken = options.getToken;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  private buildHeaders(hasBody: boolean): Headers {
    const headers = new Headers();
    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('Accept', 'application/json');
    const token = this.getToken?.();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private async parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (response.status === 204 || response.status === 205) {
      return undefined;
    }
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return undefined;
      }
    }
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const hasBody = init.body !== undefined && init.body !== null;
    const headers = this.buildHeaders(hasBody);

    if (init.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const body =
      hasBody && typeof init.body === 'object' && !(init.body instanceof FormData)
        ? JSON.stringify(init.body)
        : init.body;

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let response: Response;
      try {
        response = await fetch(url, { ...init, headers, body });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs * 2 ** attempt);
          attempt += 1;
          continue;
        }
        throw error;
      }

      if (response.ok) {
        return (await this.parseBody(response)) as T;
      }

      if (isServerError(response.status) && attempt < this.maxRetries) {
        await sleep(this.retryDelayMs * 2 ** attempt);
        attempt += 1;
        continue;
      }

      const errorBody = await this.parseBody(response);
      const message =
        (errorBody && typeof errorBody === 'object' && 'message' in errorBody
          ? String((errorBody as { message: unknown }).message)
          : undefined) ?? `Request failed with status ${response.status}`;
      throw new ApiError(response.status, message, errorBody);
    }
  }

  get<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<T = unknown>(path: string, data?: unknown, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: data as BodyInit | undefined,
    });
  }

  put<T = unknown>(path: string, data?: unknown, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'PUT',
      body: data as BodyInit | undefined,
    });
  }

  patch<T = unknown>(path: string, data?: unknown, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'PATCH',
      body: data as BodyInit | undefined,
    });
  }

  delete<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: 'DELETE' });
  }
}

function readStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem('token');
  } catch {
    return null;
  }
}

export const apiClient = new ApiClient({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '',
  getToken: readStoredToken,
});

export default apiClient;
