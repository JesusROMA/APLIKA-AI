import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getErpClient } from '@/lib/erp/db';
import { readImpersonationCookie } from '@/lib/erp/impersonation';
import { fetchSatCatalog } from '@/lib/erp/catalogs';
import type { SatCatalogEntry } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

// Forma agrupada camelCase reconciliada por el orquestador (Tanda C) para que
// UI (_lib/api.ts CatalogsResponse) y BACKEND coincidan. El contrato C3 decía
// SatCatalogEntry[]; ambos agentes convergieron a agrupado, se adopta camelCase.
interface CatalogsResponse {
  regimenFiscal: SatCatalogEntry[];
  usoCfdi: SatCatalogEntry[];
  claveUnidad: SatCatalogEntry[];
}

// GET /api/erp/catalogs — catálogos SAT para selects (lectura authenticated).
// Son globales; no requieren módulo/permiso, solo sesión válida.
export const GET = handle(async () => {
  const ctx = await requireUser();
  const impersonate = ctx.role === 'super_admin' ? readImpersonationCookie() : null;
  const supabase = getErpClient(impersonate);

  const [regimenFiscal, usoCfdi, claveUnidad] = await Promise.all([
    fetchSatCatalog(supabase, 'sat_regimen_fiscal'),
    fetchSatCatalog(supabase, 'sat_uso_cfdi'),
    fetchSatCatalog(supabase, 'sat_clave_unidad'),
  ]);

  const body: CatalogsResponse = { regimenFiscal, usoCfdi, claveUnidad };
  return ok(body);
});
