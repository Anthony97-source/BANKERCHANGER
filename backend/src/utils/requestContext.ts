import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string | number;
  method?: string;
  path?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

/**
 * Returns the request id for the current request, or undefined when called
 * outside of a request context. This is the single source of truth used by
 * the logger mixin and error middleware for request_id injection.
 */
export function getRequestId(): string | number | undefined {
  const store = requestContext.getStore();
  return store?.requestId;
}