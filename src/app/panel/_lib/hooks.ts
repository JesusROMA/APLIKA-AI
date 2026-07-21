'use client';

/** Hooks de datos del panel: carga simple y listados paginados. */

import { useEffect, useState } from 'react';
import type { Paginated, ListParams } from '@/lib/types/erp';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Error desconocido';
}

/** Carga un recurso una vez (dashboard, catálogos, detalle). */
export function useAsyncData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(errText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, reload: () => setKey((k) => k + 1) };
}

/**
 * Listado paginado. `fetcher` DEBE ser estable (usa las funciones de _lib/api,
 * que son consts a nivel de módulo). Al cambiar la búsqueda, vuelve a página 1.
 */
export function usePaginated<T>(fetcher: (params: ListParams) => Promise<Paginated<T>>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Paginated<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher({ page, pageSize, search })
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((e) => {
        if (alive) setError(errText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetcher, page, pageSize, search, key]);

  return {
    page,
    pageSize,
    search,
    data,
    loading,
    error,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    setSearch: (s: string) => {
      setSearch(s);
      setPage(1);
    },
    reload: () => setKey((k) => k + 1),
  };
}
