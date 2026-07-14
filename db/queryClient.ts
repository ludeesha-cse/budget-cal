import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import {
  REFERENCE_GC_TIME,
  REFERENCE_STALE_TIME,
  TRANSACTIONAL_GC_TIME,
  TRANSACTIONAL_STALE_TIME,
} from './queryConfig';

// The app's single QueryClient.
// TanStack Query is used here only as an in-memory cache and
// invalidation layer over local SQLite reads. 
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: TRANSACTIONAL_STALE_TIME,
        gcTime: TRANSACTIONAL_GC_TIME,
      },
      mutations: {
        networkMode: 'always',
        retry: false,
      },
    },
  });

  queryClient.setQueryDefaults(queryKeys.transactional.all, {
    staleTime: TRANSACTIONAL_STALE_TIME,
    gcTime: TRANSACTIONAL_GC_TIME,
  });
  queryClient.setQueryDefaults(queryKeys.reference.all, {
    staleTime: REFERENCE_STALE_TIME,
    gcTime: REFERENCE_GC_TIME,
  });

  return queryClient;
}
