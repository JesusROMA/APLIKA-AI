import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function toRow(r: any) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    scope: r.organization_id ? (r.organizations?.name ?? 'Tenant') : 'Global',
    keyword: r.keyword,
    response: r.response,
    category: r.category,
    active: r.active,
  };
}

// GET /api/admin/whatsapp-responses — respuestas automáticas de la plataforma
export const GET = handle(async () => {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient() as any;
  const { data, error } = await supabase
    .from('whatsapp_auto_responses')
    .select('id, organization_id, keyword, response, category, active, sort, organizations ( name )')
    .order('sort')
    .order('keyword');
  if (error) throw error;
  return ok({ responses: (data ?? []).map(toRow) });
});

const NewResponse = z.object({
  keyword: z.string().min(2, 'La palabra clave necesita al menos 2 caracteres').max(80),
  response: z.string().min(2, 'Escribe la respuesta').max(2000),
  category: z.enum(['saludo', 'citas', 'informacion', 'cortesia', 'ayuda', 'general']).default('general'),
  organizationId: z.string().uuid().nullish(), // null/undefined = global
  active: z.boolean().default(true),
});

// POST /api/admin/whatsapp-responses — nueva respuesta automática
export const POST = handle(async (req) => {
  await requireSuperAdmin();
  const b = NewResponse.parse(await req.json());
  const supabase = createSupabaseServerClient() as any;
  const { data, error } = await supabase
    .from('whatsapp_auto_responses')
    .insert({
      keyword: b.keyword.trim().toLowerCase(),
      response: b.response,
      category: b.category,
      organization_id: b.organizationId ?? null,
      active: b.active,
    })
    .select('id, organization_id, keyword, response, category, active, organizations ( name )')
    .single();
  if (error) throw new ApiError(400, error.message.includes('duplicate') ? 'Ya existe una respuesta con esa palabra clave' : error.message);
  return ok({ ok: true, response: toRow(data) }, { status: 201 });
});
