/**
 * Bot de ventas por WhatsApp — capa de I/O (Supabase service role).
 * Carga/guarda la sesión conversacional, arma las `deps` de la máquina de
 * estados (búsqueda de productos con precio del cliente y stock; creación de
 * cotización/pedido con folio por serie) y registra la charla en la bandeja
 * del Agente IA. TODO va acotado por organization_id: el service role bypassa
 * RLS, así que el scoping aquí es obligatorio.
 */

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  computeTotals,
  handleSalesMessage,
  type CartItem,
  type DocType,
  type SalesSession,
  type VariantHit,
} from './sales';

const SESSION_TTL_MS = 30 * 60_000; // 30 min de inactividad reinicia la charla

interface FlowInput {
  orgId: string;
  phone: string;
  profileName: string;
  body: string;
}

/** Últimos 10 dígitos (formato MX) para comparar teléfonos con formato libre. */
function phoneKey(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

/**
 * Corre un paso del flujo de ventas. Regresa el texto a responder, o null si
 * el mensaje no es de ventas (el webhook sigue con citas/auto-respuestas).
 */
export async function runSalesFlow({ orgId, phone, profileName, body }: FlowInput): Promise<string | null> {
  // any: la tabla 0025 aún no está en los tipos generados (misma deuda que el
  // resto de las rutas que usan el admin client).
  // eslint-disable-next-line
  const admin = createSupabaseAdminClient() as any;

  // --- Sesión guardada (expira por inactividad) ---
  const { data: row } = await admin
    .from('whatsapp_sales_sessions')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle();

  let session: SalesSession | null = null;
  if (row) {
    if (Date.now() - new Date(row.updated_at).getTime() > SESSION_TTL_MS) {
      await admin.from('whatsapp_sales_sessions').delete().eq('id', row.id);
    } else {
      session = {
        state: row.state,
        docType: row.doc_type,
        customerId: row.customer_id,
        customerName: row.customer_name,
        candidates: row.candidates ?? [],
        pending: row.pending ?? null,
        cart: row.cart ?? [],
      };
    }
  }

  // --- Cliente por teléfono (solo al arrancar sesión) ---
  let customer: { id: string; name: string; priceListId: string | null } | null = null;
  const key = phoneKey(phone);
  if (key) {
    const { data: custs } = await admin
      .from('customers')
      .select('id, name, phone, price_list_id')
      .eq('organization_id', orgId)
      .not('phone', 'is', null)
      .limit(500);
    const hit = (custs ?? []).find((c: { phone: string | null }) => phoneKey(c.phone ?? '') === key);
    if (hit) customer = { id: hit.id, name: hit.name, priceListId: hit.price_list_id };
  }
  const priceListId = customer?.priceListId ?? null;

  const deps = {
    async searchProducts(term: string): Promise<VariantHit[]> {
      let q = admin
        .from('product_variants')
        .select('id, sku, name, base_price_mxn, products ( iva_rate )')
        .eq('organization_id', orgId)
        .order('sku')
        .limit(8);
      const t = term.trim();
      if (t) q = q.or(`sku.ilike.%${t}%,name.ilike.%${t}%`);
      const { data: variants, error } = await q;
      if (error) throw error;
      const rows = (variants ?? []) as {
        id: string;
        sku: string;
        name: string;
        base_price_mxn: number;
        products: { iva_rate: number } | null;
      }[];
      const ids = rows.map((v) => v.id);
      if (!ids.length) return [];

      // Precio de la lista del cliente (si tiene); fallback: precio base.
      const listPrice = new Map<string, number>();
      if (priceListId) {
        const { data: items } = await admin
          .from('price_list_items')
          .select('product_variant_id, price_mxn')
          .eq('price_list_id', priceListId)
          .in('product_variant_id', ids);
        for (const it of items ?? []) listPrice.set(it.product_variant_id, Number(it.price_mxn));
      }

      // Stock agregado del tenant.
      const stock = new Map<string, number>();
      const { data: inv } = await admin
        .from('inventory')
        .select('product_variant_id, stock')
        .eq('organization_id', orgId)
        .in('product_variant_id', ids);
      for (const r of inv ?? []) stock.set(r.product_variant_id, (stock.get(r.product_variant_id) ?? 0) + Number(r.stock));

      return rows.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        price: listPrice.get(v.id) ?? Number(v.base_price_mxn),
        ivaRate: Number(v.products?.iva_rate ?? 0.16),
        stock: stock.get(v.id) ?? 0,
      }));
    },

    async createDocument(docType: DocType, cart: CartItem[]): Promise<{ folio: string; total: number }> {
      const { subtotal, tax, total } = computeTotals(cart);
      const notas = `Levantado por WhatsApp (${phone})${profileName ? ` — ${profileName}` : ''}`;

      // Folio por serie del tenant; si la RPC falla, folio de contingencia.
      let folio = `WA-${Date.now().toString(36).toUpperCase()}`;
      const { data: f, error: fErr } = await admin.rpc('next_serie_folio', {
        p_org: orgId,
        p_doc_type: docType === 'cotizacion' ? 'quote' : 'order',
      });
      if (!fErr && f) folio = f as string;

      const customerId = session?.customerId ?? customer?.id ?? null;

      if (docType === 'cotizacion') {
        const validUntil = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
        const { data: quote, error } = await admin
          .from('quotes')
          .insert({
            organization_id: orgId,
            folio,
            customer_id: customerId,
            status: 'borrador',
            vigencia_dias: 15,
            valid_until: validUntil,
            subtotal,
            tax,
            total,
            notas,
          })
          .select('id')
          .single();
        if (error) throw error;
        const { error: itemsErr } = await admin.from('quote_items').insert(
          cart.map((l) => ({
            organization_id: orgId,
            quote_id: quote.id,
            product_variant_id: l.variantId,
            sku: l.sku,
            name: l.name,
            qty: l.qty,
            unit_price: l.price,
            discount_pct: 0,
            iva_rate: l.ivaRate,
            line_total: Math.round(l.qty * l.price * 100) / 100,
          })),
        );
        if (itemsErr) throw itemsErr;
      } else {
        const { data: wh } = await admin
          .from('warehouses')
          .select('id')
          .eq('organization_id', orgId)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: order, error } = await admin
          .from('orders')
          .insert({
            organization_id: orgId,
            folio,
            customer_id: customerId,
            warehouse_id: wh?.id ?? null,
            status: 'borrador',
            channel: 'whatsapp',
            subtotal,
            tax,
            total,
            items_count: cart.length,
            notes: notas,
          })
          .select('id')
          .single();
        if (error) throw error;
        const { error: itemsErr } = await admin.from('order_items').insert(
          cart.map((l) => ({
            organization_id: orgId,
            order_id: order.id,
            product_variant_id: l.variantId,
            sku: l.sku,
            name: l.name,
            qty: l.qty,
            unit_price: l.price,
            line_total: Math.round(l.qty * l.price * 100) / 100,
          })),
        );
        if (itemsErr) throw itemsErr;
      }

      // Bandeja del Agente IA (best-effort; no rompe la venta).
      try {
        const { data: conv } = await admin
          .from('ai_conversations')
          .insert({
            organization_id: orgId,
            customer_phone: phone,
            customer_name: profileName || customer?.name || phone,
            channel: 'whatsapp',
            tag: docType === 'cotizacion' ? 'Cotización' : 'Pedido',
            resolved: true,
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (conv?.id) {
          await admin.from('ai_messages').insert([
            { organization_id: orgId, conversation_id: conv.id, role: 'user', body },
            { organization_id: orgId, conversation_id: conv.id, role: 'agent', body: `${docType === 'cotizacion' ? 'Cotización' : 'Pedido'} ${folio} por ${total.toFixed(2)} MXN.` },
          ]);
        }
      } catch {
        /* opcional */
      }

      return { folio, total };
    },
  };

  const result = await handleSalesMessage(body, session, deps, customer);
  if (!result.handled) return null;

  // --- Persistir o limpiar la sesión ---
  if (result.session) {
    const s = result.session;
    await admin.from('whatsapp_sales_sessions').upsert(
      {
        organization_id: orgId,
        phone,
        state: s.state,
        doc_type: s.docType,
        customer_id: s.customerId,
        customer_name: s.customerName,
        candidates: s.candidates,
        pending: s.pending,
        cart: s.cart,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,phone' },
    );
  } else if (row) {
    await admin.from('whatsapp_sales_sessions').delete().eq('id', row.id);
  }

  return result.reply;
}
