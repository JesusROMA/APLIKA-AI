import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  sku: z.string().min(1),
  warehouseId: z.string().uuid(),
  qty: z.number().int(), // con signo: + entrada / - salida
  type: z.enum(['entrada', 'salida', 'ajuste']).default('ajuste'),
  reason: z.string().optional(),
});

// POST /api/inventory/adjust — ajuste/movimiento de existencias (registra kardex)
export const POST = handle(async (req) => {
  await requireTenant();
  const body = Body.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data: variant, error: vErr } = await supabase
    .from('product_variants')
    .select('id')
    .eq('sku', body.sku)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!variant) throw new ApiError(404, 'SKU no encontrado');

  const { data, error } = await supabase.rpc('adjust_inventory', {
    p_variant: (variant as any).id,
    p_warehouse: body.warehouseId,
    p_qty: body.qty,
    p_type: body.type,
    p_reason: body.reason ?? 'Ajuste manual',
    p_ref_type: 'adjustment',
  });
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, inventory: data });
});
