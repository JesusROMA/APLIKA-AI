import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { fetchCatalogCodes } from '@/lib/erp/catalogs';
import type { CustomerRow } from '@/lib/types/erp';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const RFC_RE = /^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$/i;

const SELECT =
  'id, name, rfc, regimen_code, uso_cfdi_code, cp, contact_name, phone, email, price_list_id, credit_limit, credit_days, discount_pct, balance, active, custom, created_at, price_lists ( name )';

function toRow(c: {
  id: string;
  name: string;
  rfc: string | null;
  regimen_code: string | null;
  uso_cfdi_code: string | null;
  cp: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  price_list_id: string | null;
  credit_limit: number;
  credit_days: number;
  discount_pct: number;
  balance: number;
  active: boolean;
  custom: Json | null;
  created_at: string;
  price_lists: { name: string } | null;
}): CustomerRow {
  return {
    id: c.id,
    name: c.name,
    rfc: c.rfc,
    regimenCode: c.regimen_code,
    usoCfdiCode: c.uso_cfdi_code,
    cp: c.cp,
    contactName: c.contact_name,
    phone: c.phone,
    email: c.email,
    priceListId: c.price_list_id,
    priceListName: c.price_lists?.name ?? null,
    creditLimit: Number(c.credit_limit),
    creditDays: c.credit_days,
    discountPct: Number(c.discount_pct),
    balance: Number(c.balance),
    active: c.active,
    custom: (c.custom ?? {}) as Record<string, unknown>,
    createdAt: c.created_at,
  };
}

// GET /api/erp/customers — listado paginado (maestros/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('customers').select(SELECT, { count: 'exact' });
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error, count } = await q.order('name').range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map(toRow);
  return ok(paginated(rows, page, pageSize, count));
});

const NewCustomer = z.object({
  name: z.string().min(1),
  rfc: z
    .string()
    .trim()
    .regex(RFC_RE, 'RFC inválido')
    .optional(),
  regimenCode: z.string().trim().optional(),
  usoCfdiCode: z.string().trim().optional(),
  cp: z
    .string()
    .regex(/^[0-9]{5}$/, 'CP inválido (5 dígitos)')
    .optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  priceListId: z.string().uuid().optional(),
  creditLimit: z.number().nonnegative().default(0),
  creditDays: z.number().int().min(0).default(0),
  discountPct: z.number().min(0).max(100).default(0),
  custom: z.record(z.unknown()).optional(), // campos personalizados (F4)
});

// POST /api/erp/customers — alta (maestros/crear); valida RFC/CP/catálogos SAT
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'crear');
  const supabase = erpClientFor(session);
  const b = NewCustomer.parse(await req.json());

  // Catálogos SAT: regimen_code / uso_cfdi_code deben existir en el catálogo.
  if (b.regimenCode || b.usoCfdiCode) {
    const [regimenCodes, usoCodes] = await Promise.all([
      b.regimenCode ? fetchCatalogCodes(supabase, 'sat_regimen_fiscal') : Promise.resolve(null),
      b.usoCfdiCode ? fetchCatalogCodes(supabase, 'sat_uso_cfdi') : Promise.resolve(null),
    ]);
    if (b.regimenCode && regimenCodes && !regimenCodes.has(b.regimenCode)) {
      throw new ApiError(422, `Régimen fiscal SAT inválido: ${b.regimenCode}`);
    }
    if (b.usoCfdiCode && usoCodes && !usoCodes.has(b.usoCfdiCode)) {
      throw new ApiError(422, `Uso CFDI SAT inválido: ${b.usoCfdiCode}`);
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: session.organization!.id,
      name: b.name,
      rfc: b.rfc ? b.rfc.toUpperCase() : null,
      regimen_code: b.regimenCode ?? null,
      uso_cfdi_code: b.usoCfdiCode ?? null,
      cp: b.cp ?? null,
      contact_name: b.contactName ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      price_list_id: b.priceListId ?? null,
      credit_limit: b.creditLimit,
      credit_days: b.creditDays,
      discount_pct: b.discountPct,
      ...(b.custom ? { custom: b.custom as Json } : {}),
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, id: data.id }, { status: 201 });
});
