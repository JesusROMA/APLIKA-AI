import { ApiError, handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { erpClientFor } from '@/lib/erp/db';
import { fetchDocumentFlow } from '@/lib/erp/documents';
import type { DocType } from '@/lib/types/erp-ventas';

export const dynamic = 'force-dynamic';

const TYPES: DocType[] = ['quote', 'order', 'invoice'];

/**
 * GET /api/erp/document-flow?type=&id= — cadena documental navegable en ambos
 * sentidos (C1.6). Transversal: requiere tenant en contexto; cada nodo se filtra
 * por RLS (un documento cuyo módulo no sea visible aparece como "sin acceso").
 */
export const GET = handle(async (req) => {
  const session = await getErpSession();
  if (!session.organization) {
    throw new ApiError(403, 'Se requiere un tenant; impersona uno para operar el ERP');
  }
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const type = url.searchParams.get('type') as DocType | null;
  const id = url.searchParams.get('id');
  if (!type || !TYPES.includes(type) || !id) {
    throw new ApiError(400, 'Parámetros type (quote|order|sales_note|invoice) e id requeridos');
  }

  return ok(await fetchDocumentFlow(supabase, { type, id }));
});
