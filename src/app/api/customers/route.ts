import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { initials } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/customers — CRM de mayoreo (forma this.clientes del frontend)
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, rfc, regimen_fiscal, uso_cfdi, contact_name, phone, credit_limit, credit_days, discount_pct, balance, price_lists ( name )')
    .order('name');
  if (error) throw error;

  const clientes = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    rfc: c.rfc ?? '',
    regimen: c.regimen_fiscal ?? '',
    uso: c.uso_cfdi ?? '',
    contacto: c.contact_name ?? '',
    tel: c.phone ?? '',
    lista: c.price_lists?.name ?? '—',
    limite: Number(c.credit_limit),
    dias: c.credit_days,
    desc: `${Number(c.discount_pct)}%`,
    saldo: Number(c.balance),
    ini: initials(c.name),
  }));

  return ok({ clientes });
});

const NewCustomer = z.object({
  name: z.string().min(1),
  rfc: z.string().optional(),
  regimen: z.string().optional(),
  uso: z.string().optional(),
  contacto: z.string().optional(),
  tel: z.string().optional(),
  email: z.string().email().optional(),
  priceListId: z.string().uuid().optional(),
  creditLimit: z.number().nonnegative().default(0),
  creditDays: z.number().int().min(0).default(0),
  discountPct: z.number().min(0).max(100).default(0),
});

// POST /api/customers — alta de cliente
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const b = NewCustomer.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: ctx.organizationId,
      name: b.name,
      rfc: b.rfc,
      regimen_fiscal: b.regimen,
      uso_cfdi: b.uso,
      contact_name: b.contacto,
      phone: b.tel,
      email: b.email,
      price_list_id: b.priceListId,
      credit_limit: b.creditLimit,
      credit_days: b.creditDays,
      discount_pct: b.discountPct,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, id: data.id }, { status: 201 });
});
