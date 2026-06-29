import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/ai-agent/summary — tarjeta del agente en el dashboard
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('ai_conversations').select('resolved, order_captured');
  if (error) throw error;
  const rows = data ?? [];
  return ok({
    mensajesResueltos: rows.filter((c: any) => c.resolved).length,
    pedidosCapturados: rows.filter((c: any) => c.order_captured).length,
  });
});
