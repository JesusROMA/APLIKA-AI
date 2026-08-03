/**
 * Cliente fetch del panel de CONFIGURACIÓN (namespace `/api/erp/config`).
 * Propiedad de AGENTE-CONFIG. Wrapper delgado sobre fetch, mismo estilo que
 * `_lib/ventas-api.ts` / `_lib/expediente.ts`. No reemplaza al cliente compartido.
 */

import type {
  PermissionCell,
  PermissionOverrideInput,
  ModuleToggleRow,
  ConfigSeriesRow,
  ConfigSeriesInput,
  BrandingInfo,
  BrandingInput,
  CustomFieldDef,
  CustomFieldInput,
} from '@/lib/types/erp-config';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/config';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'No se pudo contactar el servidor');
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) msg = b.error;
    } catch {
      /* sin JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ===== Permisos (matriz RBAC del tenant) =====

/** Matriz efectiva (default global + override del tenant). */
export function getPermissions() {
  return req<{ data: PermissionCell[] }>('/permissions').then((r) => r.data);
}

/** Upsert de un override del tenant (no borra; DELETE es super_admin). */
export function putPermission(input: PermissionOverrideInput) {
  return req<{ ok: true }>('/permissions', { method: 'PUT', body: JSON.stringify(input) });
}

// ===== Módulos (activación por tenant) =====

export function getModules() {
  return req<{ data: ModuleToggleRow[] }>('/modules').then((r) => r.data);
}

/** Activa/desactiva un módulo (core rechazado con 422). */
export function toggleModule(moduleKey: string, enabled: boolean) {
  return req<{ ok: true }>('/modules', {
    method: 'POST',
    body: JSON.stringify({ moduleKey, enabled }),
  });
}

// ===== Series de folio =====

export function getSeries() {
  return req<{ data: ConfigSeriesRow[] }>('/series').then((r) => r.data);
}

export function createSeries(input: ConfigSeriesInput) {
  return req<{ ok: true; id: string }>('/series', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSeries(
  id: string,
  input: Partial<Pick<ConfigSeriesInput, 'serie' | 'prefix' | 'nextValue'>>,
) {
  return req<{ ok: true }>(`/series/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// ===== Branding =====

export function getBranding() {
  return req<BrandingInfo>('/branding');
}

export function updateBranding(input: BrandingInput) {
  return req<{ ok: true }>('/branding', { method: 'PATCH', body: JSON.stringify(input) });
}

// ===== Campos personalizados =====

export function listCustomFields(moduleKey?: string) {
  const q = moduleKey ? `?moduleKey=${encodeURIComponent(moduleKey)}` : '';
  return req<{ data: CustomFieldDef[] }>(`/custom-fields${q}`).then((r) => r.data);
}

export function createCustomField(input: CustomFieldInput) {
  return req<{ ok: true; id: string }>('/custom-fields', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCustomField(
  id: string,
  input: Partial<Omit<CustomFieldInput, 'moduleKey' | 'fieldKey'>>,
) {
  return req<{ ok: true }>(`/custom-fields/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteCustomField(id: string) {
  return req<{ ok: true }>(`/custom-fields/${id}`, { method: 'DELETE' });
}
