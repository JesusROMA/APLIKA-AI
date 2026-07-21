import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { SessionInfo } from '@/lib/types/erp';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Cliente Supabase tipado con el esquema generado. */
export type ErpClient = SupabaseClient<Database>;

/**
 * Cliente Supabase tipado para el ERP. Reusa el factory compartido (cookies de
 * sesión + header de impersonación) y le aplica el genérico `<Database>` para
 * inserts/updates/selects tipados.
 *
 * El factory compartido `createSupabaseServerClient` se mantiene SIN el genérico
 * para no re-tipar (y potencialmente romper) los ~40 endpoints existentes del
 * panel dc. Por eso aquí hacemos un único cast justificado: el cliente real es
 * el mismo, solo cambia el tipado estático.
 */
export function getErpClient(impersonateOrgId?: string | null): ErpClient {
  const client = createSupabaseServerClient(
    impersonateOrgId ? { impersonateOrgId } : undefined,
  );
  return client as unknown as ErpClient;
}

/**
 * Cliente ERP a partir de una sesión: aplica el header de impersonación cuando
 * la sesión corresponde a un super_admin impersonando un tenant.
 */
export function erpClientFor(session: Pick<SessionInfo, 'impersonating'>): ErpClient {
  return getErpClient(session.impersonating?.id ?? null);
}
