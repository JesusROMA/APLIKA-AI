import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { BrandingInfo } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

// GET /api/erp/config/branding — datos de marca del tenant (config/ver)
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, logo_url, brand_color')
    .eq('id', session.organization!.id)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, 'Organización no encontrada');

  const info: BrandingInfo = {
    name: data.name,
    logoUrl: data.logo_url,
    brandColor: data.brand_color,
  };
  return ok(info);
});

const Branding = z.object({
  logoUrl: z.string().nullable().optional(),
  brandColor: z.string().nullable().optional(),
});

// PATCH /api/erp/config/branding — actualiza logo/color vía RPC (config/configurar)
export const PATCH = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = Branding.parse(await req.json());

  // La función SQL acepta NULL (limpia el campo), pero los tipos generados
  // declaran los args como string; se castea para reflejar el contrato real.
  const { error } = await supabase.rpc('set_org_branding', {
    p_logo_url: b.logoUrl ?? null,
    p_brand_color: b.brandColor ?? null,
  } as unknown as { p_logo_url: string; p_brand_color: string });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
