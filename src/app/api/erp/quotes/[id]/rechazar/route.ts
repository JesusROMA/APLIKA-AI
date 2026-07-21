import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { Json } from '@/lib/supabase/database.types';
import { loadQuoteDetail, assertStatus } from '../../_shared';

export const dynamic = 'force-dynamic';

const Body = z.object({ motivo: z.string().trim().optional() });

// POST /api/erp/quotes/[id]/rechazar — enviada → rechazada (cotizaciones/editar)
// Soft: cambia estado y registra el motivo en `custom` (nunca borra).
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'editar');
  const supabase = erpClientFor(session);

  const { motivo } = Body.parse(await req.json().catch(() => ({})));

  const { data: quote, error: readErr } = await supabase
    .from('quotes')
    .select('id, status, custom')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!quote) throw new ApiError(404, 'Cotización no encontrada');
  assertStatus(quote.status, 'enviada', 'Solo se rechazan cotizaciones enviadas');

  const custom: Json = {
    ...((quote.custom ?? {}) as Record<string, Json>),
    rechazo: { motivo: motivo ?? null, at: new Date().toISOString() },
  };

  const { error: updErr } = await supabase
    .from('quotes')
    .update({ status: 'rechazada', custom })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadQuoteDetail(supabase, params.id));
});
