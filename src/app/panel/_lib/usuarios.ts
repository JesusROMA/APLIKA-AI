/**
 * Cliente fetch de la gestión de USUARIOS del tenant (`/api/erp/users`).
 * Mismo estilo que `_lib/config.ts`. Solo la usa Configuración → Usuarios.
 */

import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/users';

export type TenantRole = 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

export interface OrgUser {
  id: string;
  email: string;
  fullName: string | null;
  role: TenantRole | string;
  createdAt: string;
  lastSignInAt: string | null;
  suspended: boolean;
}

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
    throw new ApiError(0, 'Sin conexión con el servidor');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`);
  }
  return body as T;
}

export function getUsers() {
  return req<{ data: OrgUser[] }>('').then((r) => r.data);
}

export function createUser(input: { email: string; fullName: string; role: TenantRole }) {
  return req<{ ok: true; id: string; tempPassword: string }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchUser(id: string, input: { role?: TenantRole; suspended?: boolean }) {
  return req<{ ok: true }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function resetUserPassword(id: string) {
  return req<{ ok: true; tempPassword: string }>(`/${id}/reset-password`, { method: 'POST' });
}
