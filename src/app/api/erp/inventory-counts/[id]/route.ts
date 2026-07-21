import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadCountDetail } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/inventory-counts/[id] — detalle con partidas (inventario/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  return ok(await loadCountDetail(supabase, params.id));
});

const patchSchema = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        countedQty: z.number().int().min(0),
      }),
    )
    .min(1, 'Indica al menos una partida contada'),
});

// PATCH /api/erp/inventory-counts/[id] — captura de conteo (inventario/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);

  const { data: current, error: readErr } = await supabase
    .from('inventory_counts')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Conteo no encontrado');
  if (current.status !== 'borrador' && current.status !== 'en_conteo') {
    throw new ApiError(409, 'El conteo ya no admite captura');
  }

  const body = patchSchema.parse(await req.json());

  // Captura: actualiza counted_qty por partida (match count_id + variante).
  const results = await Promise.all(
    body.items.map((it) =>
      supabase
        .from('inventory_count_items')
        .update({ counted_qty: Math.round(it.countedQty) })
        .eq('count_id', params.id)
        .eq('product_variant_id', it.productVariantId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new ApiError(400, failed.error.message);

  // Primera captura sobre un borrador ⇒ pasa a 'en_conteo'.
  if (current.status === 'borrador') {
    const { error: stErr } = await supabase
      .from('inventory_counts')
      .update({ status: 'en_conteo' })
      .eq('id', params.id);
    if (stErr) throw new ApiError(400, stErr.message);
  }

  return ok(await loadCountDetail(supabase, params.id));
});
