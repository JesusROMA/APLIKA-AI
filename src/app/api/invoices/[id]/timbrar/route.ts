import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPacProvider } from '@/lib/pac';

export const dynamic = 'force-dynamic';

// POST /api/invoices/{id}/timbrar
// Llama a PacProvider.timbrar, guarda UUID + XML en Storage y marca timbrada.
export const POST = handle(async (_req, { params }) => {
  const ctx = await requireTenant();
  const supabase = createSupabaseServerClient();
  const id = params.id;

  const { data: inv, error } = await supabase
    .from('invoices')
    .select('id, serie, folio, status, regimen, uso_cfdi, subtotal, tax, total, order_id, customers ( name, rfc )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!inv) throw new ApiError(404, 'Factura no encontrada');
  if ((inv as any).status !== 'borrador') throw new ApiError(400, 'La factura no está en borrador');

  // Conceptos desde las líneas del pedido
  const { data: items } = await supabase
    .from('order_items')
    .select('sku, name, qty, unit_price')
    .eq('order_id', (inv as any).order_id);

  const pac = getPacProvider();
  const result = await pac.timbrar({
    serie: (inv as any).serie,
    folio: (inv as any).folio,
    receptorNombre: (inv as any).customers?.name ?? 'Público en general',
    receptorRfc: (inv as any).customers?.rfc ?? 'XAXX010101000',
    regimen: (inv as any).regimen ?? '601',
    usoCfdi: (inv as any).uso_cfdi ?? 'G03',
    subtotal: Number((inv as any).subtotal),
    tax: Number((inv as any).tax),
    total: Number((inv as any).total),
    conceptos: (items ?? []).map((c: any) => ({ sku: c.sku ?? '', name: c.name, qty: c.qty, unitPrice: Number(c.unit_price) })),
  });

  // Guarda el XML en Storage (bucket 'cfdi'), ruta por organización
  const admin = createSupabaseAdminClient();
  const xmlPath = `${ctx.organizationId}/${(inv as any).serie}-${(inv as any).folio}.xml`;
  const { error: upErr } = await admin.storage
    .from('cfdi')
    .upload(xmlPath, new Blob([result.xml], { type: 'application/xml' }), { upsert: true });
  if (upErr) throw new ApiError(500, `No se pudo guardar el XML: ${upErr.message}`);

  let pdfPath: string | null = null;
  if (result.pdfBase64) {
    pdfPath = `${ctx.organizationId}/${(inv as any).serie}-${(inv as any).folio}.pdf`;
    await admin.storage
      .from('cfdi')
      .upload(pdfPath, Buffer.from(result.pdfBase64, 'base64'), { upsert: true, contentType: 'application/pdf' });
  }

  const { error: updErr } = await supabase
    .from('invoices')
    .update({ uuid: result.uuid, status: 'timbrada', xml_path: xmlPath, pdf_path: pdfPath, timbrada_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw new ApiError(400, updErr.message);

  // Avanza el pedido a 'facturado' si corresponde
  if ((inv as any).order_id) {
    await supabase.rpc('transition_order', { p_order_id: (inv as any).order_id, p_new: 'facturado' }).then(() => {}, () => {});
  }

  return ok({ ok: true, uuid: result.uuid, xmlPath });
});
