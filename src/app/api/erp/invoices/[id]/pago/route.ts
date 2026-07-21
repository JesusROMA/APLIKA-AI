import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { getPacProvider, type RepInput } from '@/lib/pac';
import { loadInvoiceDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const RFC_GENERICO = 'XAXX010101000';

const PagoBody = z.object({
  monto: z.number().positive(),
  formaPago: z.string().trim().min(1),
});

// POST /api/erp/invoices/[id]/pago — registra un pago (facturacion/editar).
// Si la factura es PPD, timbra primero el REP (complemento de pago) y adjunta su
// UUID. La RPC registrar_pago_factura inserta el pago, recalcula saldo y fija
// pagada/pago_parcial.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'editar');
  const supabase = erpClientFor(session);

  const b = PagoBody.parse(await req.json());

  const inv = await loadInvoiceDetail(supabase, params.id);
  if (inv.status !== 'timbrada' && inv.status !== 'pago_parcial') {
    throw new ApiError(409, `La factura no admite pagos (estado: ${inv.status})`);
  }

  let repUuid: string | null = null;

  if (inv.metodoPago === 'PPD') {
    if (!inv.uuid) {
      throw new ApiError(409, 'La factura PPD no tiene UUID fiscal para el REP');
    }
    // Receptor fiscal del complemento de pago.
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

    const saldoAnterior = inv.saldo ?? inv.total;
    const repInput: RepInput = {
      serie: inv.serie,
      folio: inv.folio,
      facturaUuid: inv.uuid,
      receptorNombre,
      receptorRfc,
      monto: b.monto,
      formaPago: b.formaPago,
      numParcialidad: inv.payments.length + 1,
      saldoAnterior,
      saldoInsoluto: saldoAnterior - b.monto,
    };
    const rep = await getPacProvider().timbrarREP(repInput);
    repUuid = rep.uuid;
  }

  const { error } = await supabase.rpc('registrar_pago_factura', {
    p_invoice: inv.id,
    p_monto: b.monto,
    p_forma: b.formaPago,
    p_uuid_rep: repUuid ?? undefined,
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: facturacion/editar');
    throw new ApiError(400, error.message);
  }

  return ok(await loadInvoiceDetail(supabase, inv.id));
});
