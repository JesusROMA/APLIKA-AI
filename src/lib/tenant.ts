import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Resuelve el slug del tenant a partir del host de la petición.
 *   refanorte.aplika.shop      -> "refanorte"
 *   refanorte.localhost:3000   -> "refanorte"
 *   tienda propia (custom)     -> se resuelve por custom_domain
 *   app.aplika.shop / aplika.shop / localhost -> null (no es storefront de tenant)
 */
export function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  const root = env.rootDomain().toLowerCase();

  // Subdominio del dominio raíz
  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (!sub || sub === 'www' || sub === 'app') return null;
    return sub;
  }
  // Soporte local: refanorte.localhost
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.slice(0, -'.localhost'.length);
    return sub === 'www' || sub === 'app' ? null : sub;
  }
  return null;
}

/** Resuelve la organización del storefront actual (subdominio o dominio propio). */
export async function resolveStorefrontOrg(): Promise<{ id: string; slug: string; name: string } | null> {
  const host = headers().get('host');
  const slug = tenantSlugFromHost(host);
  const admin = createSupabaseAdminClient();

  if (slug) {
    const { data } = await admin
      .from('organizations')
      .select('id, slug, name')
      .eq('slug', slug)
      .maybeSingle();
    if (data) return data as { id: string; slug: string; name: string };
  }
  // Dominio personalizado
  if (host) {
    const hostname = host.split(':')[0].toLowerCase();
    const { data } = await admin
      .from('organizations')
      .select('id, slug, name')
      .eq('custom_domain', hostname)
      .maybeSingle();
    if (data) return data as { id: string; slug: string; name: string };
  }
  return null;
}
