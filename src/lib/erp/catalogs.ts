import type { SatCatalogEntry } from '@/lib/types/erp';
import type { VentasCatalogs } from '@/lib/types/erp-ventas';
import type { ErpClient } from '@/lib/erp/db';

export type SatCatalogTable =
  | 'sat_regimen_fiscal'
  | 'sat_uso_cfdi'
  | 'sat_clave_unidad'
  | 'sat_forma_pago'
  | 'sat_metodo_pago';

/** Lee un catálogo SAT global (lectura authenticated). Ordenado por code. */
export async function fetchSatCatalog(
  supabase: ErpClient,
  table: SatCatalogTable,
): Promise<SatCatalogEntry[]> {
  const { data, error } = await supabase.from(table).select('code, label').order('code');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, label: r.label }));
}

/** Set de codes válidos de un catálogo, para validar inputs contra el SAT. */
export async function fetchCatalogCodes(
  supabase: ErpClient,
  table: SatCatalogTable,
): Promise<Set<string>> {
  const { data, error } = await supabase.from(table).select('code');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.code));
}

/** Catálogos SAT de pago (forma/método) para los selects de facturación (F1). */
export async function fetchVentasCatalogs(supabase: ErpClient): Promise<VentasCatalogs> {
  const [formaPago, metodoPago] = await Promise.all([
    fetchSatCatalog(supabase, 'sat_forma_pago'),
    fetchSatCatalog(supabase, 'sat_metodo_pago'),
  ]);
  return { formaPago, metodoPago };
}
