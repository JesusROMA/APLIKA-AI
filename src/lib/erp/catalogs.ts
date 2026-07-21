import type { SatCatalogEntry } from '@/lib/types/erp';
import type { ErpClient } from '@/lib/erp/db';

export type SatCatalogTable = 'sat_regimen_fiscal' | 'sat_uso_cfdi' | 'sat_clave_unidad';

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
