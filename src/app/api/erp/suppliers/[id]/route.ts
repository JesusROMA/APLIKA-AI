import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { SupplierRow } from '@/lib/types/erp-compras';
import type { Json, TablesUpdate } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const RFC_RE = /^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$/i;

const SELECT =
  'id, name, rfc, contact_name, phone, email, address, payment_days, balance, active, custom, created_at';

function toSupplierRow(s: {
  id: string;
  name: string;
  rfc: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_days: number;
  balance: number;
  active: boolean;
  custom: Json | null;
  created_at: string;
}): SupplierRow {
  return {
    id: s.id,
    name: s.name,
    rfc: s.rfc,
    contactName: s.contact_name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    paymentDays: s.payment_days,
    balance: Number(s.balance),
    active: s.active,
    custom: (s.custom ?? {}) as Record<string, unknown>,
    createdAt: s.created_at,
  };
}

// GET /api/erp/suppliers/[id] — ficha (compras/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('suppliers')
    .select(SELECT)
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Proveedor no encontrado');
  return ok(toSupplierRow(data));
});

const Patch = z.object({
  name: z.string().min(1).optional(),
  rfc: z.string().trim().regex(RFC_RE, 'RFC inválido').nullable().optional(),
  contactName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  paymentDays: z.number().int().min(0).optional(),
  active: z.boolean().optional(), // soft-inactivar (suppliers.active)
  custom: z.record(z.unknown()).optional(),
});

// PATCH /api/erp/suppliers/[id] — edición parcial (compras/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'suppliers'> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.rfc !== undefined) update.rfc = b.rfc ? b.rfc.toUpperCase() : null;
  if (b.contactName !== undefined) update.contact_name = b.contactName;
  if (b.phone !== undefined) update.phone = b.phone;
  if (b.email !== undefined) update.email = b.email;
  if (b.address !== undefined) update.address = b.address;
  if (b.paymentDays !== undefined) update.payment_days = b.paymentDays;
  if (b.active !== undefined) update.active = b.active;
  if (b.custom !== undefined) update.custom = b.custom as TablesUpdate<'suppliers'>['custom'];

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('suppliers').update(update).eq('id', params.id);
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'Ya existe un proveedor con ese nombre');
    }
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
