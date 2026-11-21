import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import type { ApiSchemas } from "../types/api";

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseApiResult<T> extends UseApiState<T> {
  refetch: () => Promise<void>;
}

/**
 * Generic hook for fetching data from the API with loading/error state.
 * The response type is inferred from the generated OpenAPI types.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseApiResult<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (mountedRef.current) {
        setState({ data, loading: false, error: null });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: load };
}

/**
 * Typed convenience hooks backed by the generated OpenAPI schemas.
 */
export function useConfig() {
  return useApi<ApiSchemas["Config"]>(() => apiClient.getConfig());
}

export function useStrategies() {
  return useApi<ApiSchemas["Strategy"][]>(() => apiClient.getStrategies());
}

export function usePositions() {
  return useApi<ApiSchemas["Position"][]>(() => apiClient.getPositions());
}

export function useOrders() {
  return useApi<ApiSchemas["Order"][]>(() => apiClient.getOrders());
}

export function usePortfolio() {
  return useApi<ApiSchemas["Portfolio"]>(() => apiClient.getPortfolio());
}
