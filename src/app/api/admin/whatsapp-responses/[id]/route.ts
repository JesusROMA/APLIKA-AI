import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  keyword: z.string().min(2).max(80).optional(),
  response: z.string().min(2).max(2000).optional(),
  category: z.enum(['saludo', 'citas', 'informacion', 'cortesia', 'ayuda', 'general']).optional(),
  active: z.boolean().optional(),
});

// PATCH /api/admin/whatsapp-responses/{id} — editar / activar / desactivar
export const PATCH = handle(async (req, { params }) => {
  await requireSuperAdmin();
  const b = Patch.parse(await req.json());
  const patch: Record<string, unknown> = {};
  if (b.keyword !== undefined) patch.keyword = b.keyword.trim().toLowerCase();
  if (b.response !== undefined) patch.response = b.response;
  if (b.category !== undefined) patch.category = b.category;
  if (b.active !== undefined) patch.active = b.active;
  if (!Object.keys(patch).length) return ok({ ok: true, unchanged: true });

  const supabase = createSupabaseServerClient() as any;
  const { error } = await supabase.from('whatsapp_auto_responses').update(patch).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});

// DELETE /api/admin/whatsapp-responses/{id}
export const DELETE = handle(async (_req, { params }) => {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient() as any;
  const { error } = await supabase.from('whatsapp_auto_responses').delete().eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
