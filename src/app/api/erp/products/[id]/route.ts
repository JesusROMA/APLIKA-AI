import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { PRODUCT_SELECT, stockByVariant, toProductRow, type RawProduct } from '@/lib/erp/products';
import type { TablesUpdate } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

// GET /api/erp/products/[id] — producto con variantes + stock (maestros/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestro_productos', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Producto no encontrado');

  const product = data as unknown as RawProduct;
  const stock = await stockByVariant(supabase, (product.product_variants ?? []).map((v) => v.id));
  return ok({ product: toProductRow(product, stock) });
});

const Patch = z.object({
  name: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tipo: z.enum(['producto', 'servicio']).optional(),
  claveProdServ: z.string().nullable().optional(),
  ivaRate: z.number().min(0).max(1).optional(),
});

// PATCH /api/erp/products/[id] — edita datos del producto (maestros/editar).
// Las variantes se gestionan aparte (F1); aquí van claves SAT/iva/tipo.
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestro_productos', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'products'> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.category !== undefined) update.category = b.category;
  if (b.description !== undefined) update.description = b.description;
  if (b.tipo !== undefined) update.tipo = b.tipo;
  if (b.claveProdServ !== undefined) update.clave_prod_serv = b.claveProdServ;
  if (b.ivaRate !== undefined) update.iva_rate = b.ivaRate;

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('products').update(update).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
