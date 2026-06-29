import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function rel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const ICON: Record<string, string> = {
  error: 'M12 8v5M12 16v.01M10.3 4.3 3 18a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  warn: 'M7 3h8l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3z',
  ok: 'M5 12.5 10 17.5 19 6.5',
};

// GET /api/admin/incidents — eventos recientes (monitoreo)
export const GET = handle(async () => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('incidents')
    .select('title, detail, severity, created_at, organizations ( name )')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;

  const incidents = (data ?? []).map((i: any) => ({
    title: i.title,
    detail: (i.organizations?.name ? `${i.organizations.name} · ` : '') + (i.detail ?? ''),
    time: rel(i.created_at),
    sev: i.severity,
    d: ICON[i.severity] ?? ICON.warn,
  }));
  return ok({ incidents });
});
