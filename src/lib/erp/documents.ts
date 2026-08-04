import type { ErpClient } from '@/lib/erp/db';
import { resolveVariantPrice } from '@/lib/erp/pricing';
import { lineTotalOf } from '@/lib/erp/totals';
import type {
  DocLine,
  DocLineInput,
  DocType,
  DocFlowNode,
  DocumentFlow,
} from '@/lib/types/erp-ventas';

/**
 * FLUJO DOCUMENTAL + NORMALIZACIÓN DE PARTIDAS (server) — pieza compartida F1
 * (C1.6 / C1.8). PROPIEDAD DEL ORQUESTADOR. Las fórmulas puras de totales viven
 * en `totals.ts` (client-safe) y se re-exportan aquí por conveniencia de los
 * endpoints. Los 4 submódulos calculan totales y ligan documentos SOLO a través
 * de estas piezas; NO reimplementar en los endpoints.
 */

export { round2, lineTotalOf, computeTotals } from '@/lib/erp/totals';

/**
 * Normaliza partidas de entrada a `DocLine[]` calculadas en servidor: resuelve
 * SKU/nombre/IVA desde la variante y el precio desde la lista SELECCIONADA del
 * documento (F8) o la del cliente (`resolveVariantPrice`) cuando no vienen
 * dados, y calcula `lineTotal`. Los endpoints validan antes de llamar.
 */
export async function buildLines(
  supabase: ErpClient,
  customerId: string | null | undefined,
  inputs: DocLineInput[],
  priceListId?: string | null,
): Promise<DocLine[]> {
  const out: DocLine[] = [];
  for (const inp of inputs) {
    let sku = inp.sku ?? null;
    let name = inp.name ?? '';
    let ivaRate = inp.ivaRate ?? 0.16;
    let unitPrice = inp.unitPrice;

    if (inp.productVariantId) {
      const { data: v } = await supabase
        .from('product_variants')
        .select('sku, name, base_price_mxn, products ( iva_rate )')
        .eq('id', inp.productVariantId)
        .maybeSingle();
      if (v) {
        if (!sku) sku = v.sku;
        if (!name) name = v.name;
        if (inp.ivaRate === undefined) {
          const prod = v.products as { iva_rate: number } | null;
          ivaRate = Number(prod?.iva_rate ?? 0.16);
        }
        if (unitPrice === undefined) {
          const p = await resolveVariantPrice(
            supabase,
            inp.productVariantId,
            customerId ?? null,
            priceListId ?? null,
          );
          unitPrice = p ?? Number(v.base_price_mxn);
        }
      }
    }

    const price = unitPrice ?? 0;
    const discountPct = inp.discountPct ?? 0;
    out.push({
      productVariantId: inp.productVariantId ?? null,
      sku,
      name,
      qty: inp.qty,
      unitPrice: price,
      discountPct,
      ivaRate,
      lineTotal: lineTotalOf(inp.qty, price, discountPct),
    });
  }
  return out;
}

/** Liga dos documentos (idempotente) vía la RPC transversal `link_docs`. */
export async function linkDocs(
  supabase: ErpClient,
  src: { type: DocType; id: string },
  dst: { type: DocType; id: string },
): Promise<void> {
  const { error } = await supabase.rpc('link_docs', {
    p_src_type: src.type,
    p_src_id: src.id,
    p_dst_type: dst.type,
    p_dst_id: dst.id,
  });
  if (error) throw error;
}

const keyOf = (type: DocType, id: string) => `${type}:${id}`;

/**
 * Cadena documental navegable en AMBOS sentidos (C1.6): BFS sobre
 * `document_links` desde el nodo inicial, recolectando cada documento
 * relacionado y su cabecera (folio/estado/total). Los flujos son pequeños
 * (unos pocos documentos), así que el N+1 es despreciable. Un nodo cuyo módulo
 * no sea visible bajo RLS aparece con estado "sin acceso".
 */
export async function fetchDocumentFlow(
  supabase: ErpClient,
  start: { type: DocType; id: string },
): Promise<DocumentFlow> {
  const visited = new Set<string>();
  const order: { type: DocType; id: string }[] = [];
  const edgeSet = new Set<string>();
  const queue: { type: DocType; id: string }[] = [start];

  while (queue.length) {
    const cur = queue.shift()!;
    const ck = keyOf(cur.type, cur.id);
    if (visited.has(ck)) continue;
    visited.add(ck);
    order.push(cur);

    const { data: links } = await supabase
      .from('document_links')
      .select('src_type, src_id, dst_type, dst_id')
      .or(
        `and(src_type.eq.${cur.type},src_id.eq.${cur.id}),and(dst_type.eq.${cur.type},dst_id.eq.${cur.id})`,
      );

    for (const l of links ?? []) {
      const from = keyOf(l.src_type as DocType, l.src_id);
      const to = keyOf(l.dst_type as DocType, l.dst_id);
      edgeSet.add(`${from}->${to}`);
      const neighbor =
        ck === from
          ? { type: l.dst_type as DocType, id: l.dst_id }
          : { type: l.src_type as DocType, id: l.src_id };
      if (!visited.has(keyOf(neighbor.type, neighbor.id))) queue.push(neighbor);
    }
  }

  const nodes: DocFlowNode[] = [];
  for (const n of order) nodes.push(await fetchNodeHeader(supabase, n));
  const edges = [...edgeSet].map((e) => {
    const [from, to] = e.split('->');
    return { from, to };
  });
  return { nodes, edges };
}

async function fetchNodeHeader(
  supabase: ErpClient,
  node: { type: DocType; id: string },
): Promise<DocFlowNode> {
  const miss: DocFlowNode = {
    type: node.type,
    id: node.id,
    folio: '—',
    status: 'sin acceso',
    total: 0,
  };
  switch (node.type) {
    case 'quote':
    case 'order': {
      const table = node.type === 'quote' ? 'quotes' : 'orders';
      const { data } = await supabase
        .from(table)
        .select('folio, status, total')
        .eq('id', node.id)
        .maybeSingle();
      if (!data) return miss;
      return { type: node.type, id: node.id, folio: data.folio, status: data.status, total: Number(data.total) };
    }
    case 'invoice': {
      const { data } = await supabase
        .from('invoices')
        .select('serie, folio, status, total')
        .eq('id', node.id)
        .maybeSingle();
      if (!data) return miss;
      return {
        type: 'invoice',
        id: node.id,
        folio: data.folio, // factura ahora usa folio de serie (FAC-A-0001)
        status: data.status,
        total: Number(data.total),
      };
    }
    default:
      return miss;
  }
}
