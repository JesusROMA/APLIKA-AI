import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';

export const dynamic = 'force-dynamic';

// Cantidades enteras. Las ENTRADAS de inventario ya NO se registran aquí: pasan
// exclusivamente por Órdenes de entrada (F6). Aquí solo salidas y ajustes.
// 'salida' exige > 0; 'ajuste' admite signo (merma −/sobrante +) pero no 0.
const movementSchema = z
  .object({
    productVariantId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    type: z.enum(['salida', 'ajuste']),
    qty: z.number().int('La cantidad debe ser un número entero'),
    reason: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((b) => (b.type === 'ajuste' ? b.qty !== 0 : b.qty > 0), {
    message: 'La cantidad debe ser mayor a 0',
    path: ['qty'],
  });

// POST /api/erp/inventory/movimientos — alta de movimiento manual (inventario/crear).
// Deriva el signo de p_qty por tipo y delega el costeo/kardex en adjust_inventory.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'crear');
  const supabase = erpClientFor(session);

  const body = movementSchema.parse(await req.json());

  // salida → −qty · ajuste → qty tal cual (con signo). Sin costo: las salidas
  // salen al costo promedio (COGS) y los ajustes no lo alteran.
  const signedQty = body.type === 'salida' ? -body.qty : body.qty;

  // p_reason / p_ref_id son opcionales con default NULL en la función (0014);
  // se OMITEN cuando no aplican (los tipos generados no admiten `null`).
  const { error } = await supabase.rpc('adjust_inventory', {
    p_variant: body.productVariantId,
    p_warehouse: body.warehouseId,
    p_qty: signedQty,
    p_type: body.type,
    p_ref_type: 'manual',
    ...(body.reason ? { p_reason: body.reason } : {}),
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: inventario/crear');
    if (error.code === 'P0001') throw new ApiError(409, error.message); // stock insuficiente
    throw new ApiError(400, error.message);
  }

  return ok({ ok: true }, { status: 201 });
});
