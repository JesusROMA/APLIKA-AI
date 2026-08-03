import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchCatalogCodes } from '@/lib/erp/catalogs';
import type { TablesUpdate } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const RFC_RE = /^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$/i;

// GET /api/erp/customers/[id] — ficha (maestros/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('customers')
    .select('*, price_lists ( name )')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Cliente no encontrado');
  return ok({ customer: data });
});

const Patch = z.object({
  name: z.string().min(1).optional(),
  rfc: z.string().trim().regex(RFC_RE, 'RFC inválido').nullable().optional(),
  regimenCode: z.string().trim().nullable().optional(),
  usoCfdiCode: z.string().trim().nullable().optional(),
  cp: z
    .string()
    .regex(/^[0-9]{5}$/, 'CP inválido (5 dígitos)')
    .nullable()
    .optional(),
  contactName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  priceListId: z.string().uuid().nullable().optional(),
  creditLimit: z.number().nonnegative().optional(),
  creditDays: z.number().int().min(0).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(), // soft-inactivar (columna customers.active)
  custom: z.record(z.unknown()).optional(), // campos personalizados (F4)
});

// PATCH /api/erp/customers/[id] — edición parcial (maestros/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  // Validación SAT en edición
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

  const update: TablesUpdate<'customers'> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.rfc !== undefined) update.rfc = b.rfc ? b.rfc.toUpperCase() : null;
  if (b.regimenCode !== undefined) update.regimen_code = b.regimenCode;
  if (b.usoCfdiCode !== undefined) update.uso_cfdi_code = b.usoCfdiCode;
  if (b.cp !== undefined) update.cp = b.cp;
  if (b.contactName !== undefined) update.contact_name = b.contactName;
  if (b.phone !== undefined) update.phone = b.phone;
  if (b.email !== undefined) update.email = b.email;
  if (b.priceListId !== undefined) update.price_list_id = b.priceListId;
  if (b.creditLimit !== undefined) update.credit_limit = b.creditLimit;
  if (b.creditDays !== undefined) update.credit_days = b.creditDays;
  if (b.discountPct !== undefined) update.discount_pct = b.discountPct;
  if (b.active !== undefined) update.active = b.active;
  if (b.custom !== undefined) update.custom = b.custom as TablesUpdate<'customers'>['custom'];

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('customers').update(update).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
