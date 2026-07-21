import { z } from 'zod';
import type { Paginated } from '@/lib/types/erp';

/** Query params de paginación obligatoria en listados ERP (C3). */
export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ParsedListParams = z.infer<typeof listParamsSchema>;

/** Extrae y valida los parámetros de listado desde la URL. */
export function parseListParams(url: URL): ParsedListParams {
  return listParamsSchema.parse(Object.fromEntries(url.searchParams));
}

/** Rango [from, to] inclusivo para `.range()` de PostgREST. */
export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** Envuelve datos + metadatos en la forma `Paginated<T>` del contrato. */
export function paginated<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number | null,
): Paginated<T> {
  return { data, page, pageSize, total: total ?? 0 };
}
