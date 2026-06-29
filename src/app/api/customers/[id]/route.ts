import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/customers/{id} — ficha del cliente
export const GET = handle(async (_req, { params }) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
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
  rfc: z.string().optional(),
  regimen_fiscal: z.string().optional(),
  uso_cfdi: z.string().optional(),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  price_list_id: z.string().uuid().optional(),
  credit_limit: z.number().nonnegative().optional(),
  credit_days: z.number().int().min(0).optional(),
  discount_pct: z.number().min(0).max(100).optional(),
});

// PATCH /api/customers/{id} — edición de la ficha
export const PATCH = handle(async (req, { params }) => {
  await requireTenant();
  const patch = Patch.parse(await req.json());
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from('customers').update(patch).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
