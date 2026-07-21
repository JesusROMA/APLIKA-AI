import type { ErpClient } from '@/lib/erp/db';
import type { DocType } from '@/lib/types/erp-ventas';

/** Tipos de documento que numeran por serie (ventas F1 + inventario F2). */
export type FolioDocType = DocType | 'count' | 'transfer';

/**
 * Folio consecutivo por serie (C1.1). Envuelve la RPC `next_serie_folio`, que es
 * atómica (`FOR UPDATE`) y autocrea la fila de `org_series` en el primer uso.
 * Devuelve el folio formateado, p.ej. `"COT-A-0001"`, `"CONT-A-0001"`.
 *
 * PROPIEDAD DEL ORQUESTADOR (pieza compartida). Los submódulos la consumen para
 * numerar sus documentos sin reimplementar la lógica de series.
 */
export async function nextSerieFolio(
  supabase: ErpClient,
  orgId: string,
  docType: FolioDocType,
  serie?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('next_serie_folio', {
    p_org: orgId,
    p_doc_type: docType,
    // p_serie es opcional en la RPC (default null en BD ⇒ serie por defecto).
    ...(serie ? { p_serie: serie } : {}),
  });
  if (error) throw error;
  return data as string;
}
