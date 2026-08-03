import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { SupplierRow } from '@/lib/types/erp-compras';
import type { Json } from '@/lib/supabase/database.types';

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

// GET /api/erp/suppliers — listado paginado (compras/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('suppliers').select(SELECT, { count: 'exact' });
  if (search) q = q.or(`name.ilike.%${search}%,rfc.ilike.%${search}%`);
  if (status === 'activo') q = q.eq('active', true);
  else if (status === 'inactivo') q = q.eq('active', false);
  const { data, error, count } = await q.order('name').range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map(toSupplierRow);
  return ok(paginated(rows, page, pageSize, count));
});

const NewSupplier = z.object({
  name: z.string().min(1),
  rfc: z.string().trim().regex(RFC_RE, 'RFC inválido').optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  paymentDays: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  custom: z.record(z.unknown()).optional(),
});

// POST /api/erp/suppliers — alta (compras/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'crear');
  const supabase = erpClientFor(session);
  const b = NewSupplier.parse(await req.json());

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      organization_id: session.organization!.id,
      created_by: session.userId,
      name: b.name,
      rfc: b.rfc ? b.rfc.toUpperCase() : null,
      contact_name: b.contactName ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      address: b.address ?? null,
      payment_days: b.paymentDays,
      active: b.active,
      ...(b.custom ? { custom: b.custom as Json } : {}),
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'Ya existe un proveedor con ese nombre');
    }
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true, id: data.id }, { status: 201 });
});
