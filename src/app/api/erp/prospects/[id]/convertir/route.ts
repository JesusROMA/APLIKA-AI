import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/erp/prospects/[id]/convertir — crea un `customers` a partir del
 * prospecto (name/contact/phone/email), setea `crm_prospects.customer_id` y
 * marca la etapa como 'ganado'. Idempotente: si ya está convertido, devuelve
 * el `customerId` existente. Permiso crm/crear.
 */
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'crear');
  const supabase = erpClientFor(session);

  const { data: prospect, error: readErr } = await supabase
    .from('crm_prospects')
    .select('id, name, contact_name, phone, email, customer_id')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!prospect) throw new ApiError(404, 'Prospecto no encontrado');

  // Idempotencia: ya convertido → devolver el cliente existente.
  if (prospect.customer_id) {
    return ok({ ok: true, customerId: prospect.customer_id });
  }

  // Alta de cliente (escritura de datos permitida).
  const { data: customer, error: insErr } = await supabase
    .from('customers')
    .insert({
      organization_id: session.organization!.id,
      name: prospect.name,
      contact_name: prospect.contact_name ?? null,
      phone: prospect.phone ?? null,
      email: prospect.email ?? null,
    })
    .select('id')
    .single();
  if (insErr) throw new ApiError(400, insErr.message);

  const { error: updErr } = await supabase
    .from('crm_prospects')
    .update({ customer_id: customer.id, stage: 'ganado' })
    .eq('id', prospect.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok({ ok: true, customerId: customer.id }, { status: 201 });
});
