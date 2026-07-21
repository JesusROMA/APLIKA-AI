import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { getPacProvider, type CfdiInput } from '@/lib/pac';
import { loadInvoiceDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// RFC genérico SAT para operaciones con público en general / sin RFC.
const RFC_GENERICO = 'XAXX010101000';

// POST /api/erp/invoices/[id]/timbrar — timbra un CFDI 4.0 vía el PAC
// (facturacion/editar). SOLO desde 'borrador'.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'editar');
  const supabase = erpClientFor(session);

  const inv = await loadInvoiceDetail(supabase, params.id);
  if (inv.status !== 'borrador') {
    throw new ApiError(409, `La factura no está en borrador (estado: ${inv.status})`);
  }

  // Datos fiscales del receptor (nombre/RFC desde el cliente).
  let receptorNombre = inv.customerName ?? 'PÚBLICO EN GENERAL';
  let receptorRfc = RFC_GENERICO;
  if (inv.customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('name, rfc')
      .eq('id', inv.customerId)
      .maybeSingle();
    if (cust) {
      receptorNombre = cust.name ?? receptorNombre;
      receptorRfc = cust.rfc ?? RFC_GENERICO;
    }
  }

  const input: CfdiInput = {
    serie: inv.serie,
    folio: inv.folio,
    receptorNombre,
    receptorRfc,
    regimen: inv.regimen ?? '',
    usoCfdi: inv.usoCfdi ?? '',
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    conceptos: inv.items.map((i) => ({
      sku: i.sku ?? '',
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
    })),
  };

  const result = await getPacProvider().timbrar(input);

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'timbrada',
      uuid: result.uuid,
      timbrada_at: new Date().toISOString(),
      saldo: inv.total,
    })
    .eq('id', inv.id);
  if (error) throw new ApiError(400, error.message);

  return ok(await loadInvoiceDetail(supabase, inv.id));
});
