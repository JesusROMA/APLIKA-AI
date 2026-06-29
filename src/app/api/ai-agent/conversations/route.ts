import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { initials } from '@/lib/format';

export const dynamic = 'force-dynamic';

function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  return diffDays <= 1 ? 'Ayer' : `${diffDays} d`;
}

// GET /api/ai-agent/conversations — bandeja del agente (forma this.iaConvs)
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, customer_phone, customer_name, tag, unread, last_message_at, ai_messages ( body, created_at )')
    .order('last_message_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const conversations = (data ?? []).map((c: any) => {
    const last = (c.ai_messages ?? []).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
    return {
      id: c.id,
      name: c.customer_phone ?? c.customer_name ?? '—',
      preview: last?.body ?? '',
      time: relTime(c.last_message_at),
      unread: c.unread,
      ini: initials(c.customer_name ?? 'NA'),
      tag: c.tag ?? 'Info',
    };
  });

  return ok({ conversations });
});
