import { describe, it, expect, vi } from 'vitest';
import {
  computeTotals,
  handleSalesMessage,
  type SalesDeps,
  type SalesSession,
  type VariantHit,
} from '@/lib/whatsapp/sales';

const BALATA: VariantHit = { id: 'v1', sku: 'BAL-1184', name: 'Balata cerámica D-1184', price: 360, ivaRate: 0.16, stock: 14 };
const BALATA2: VariantHit = { id: 'v2', sku: 'BAL-S220', name: 'Balata semimetálica S-220', price: 380, ivaRate: 0.16, stock: 58 };
const ACEITE: VariantHit = { id: 'v3', sku: 'ACE-2050', name: 'Aceite 20W-50', price: 980, ivaRate: 0.16, stock: 8 };

function deps(hits: VariantHit[] = [], folio = 'COT-A-0009'): SalesDeps {
  return {
    searchProducts: vi.fn(async () => hits),
    createDocument: vi.fn(async (_t, cart) => ({ folio, total: computeTotals(cart).total })),
  };
}

describe('computeTotals', () => {
  it('aplica IVA por partida y redondea a centavos', () => {
    const t = computeTotals([
      { variantId: 'v1', sku: 'A', name: 'A', qty: 2, price: 360, ivaRate: 0.16 },
      { variantId: 'v2', sku: 'B', name: 'B', qty: 1, price: 100, ivaRate: 0 },
    ]);
    expect(t.subtotal).toBe(820);
    expect(t.tax).toBe(115.2);
    expect(t.total).toBe(935.2);
  });
});

describe('handleSalesMessage', () => {
  it('mensaje ajeno sin sesión no se maneja (cae a citas/auto-respuestas)', async () => {
    const r = await handleSalesMessage('hola, ¿a qué hora abren?', null, deps());
    expect(r.handled).toBe(false);
    expect(r.session).toBeNull();
  });

  it('«cotización» arranca sesión y saluda al cliente identificado', async () => {
    const r = await handleSalesMessage('quiero una cotización', null, deps(), { id: 'c1', name: 'Jorge Salinas' });
    expect(r.handled).toBe(true);
    expect(r.session?.docType).toBe('cotizacion');
    expect(r.session?.state).toBe('product');
    expect(r.reply).toContain('Jorge');
  });

  it('«pedido» arranca flujo de pedido', async () => {
    const r = await handleSalesMessage('quiero hacer un pedido', null, deps());
    expect(r.session?.docType).toBe('pedido');
  });

  it('búsqueda con un solo resultado pide cantidad directo', async () => {
    const start = await handleSalesMessage('cotización', null, deps());
    const r = await handleSalesMessage('balata cerámica', start.session, deps([BALATA]));
    expect(r.session?.state).toBe('qty');
    expect(r.reply).toContain('BAL-1184');
    expect(r.reply).toContain('Cuántas');
  });

  it('varios resultados listan numerado y el número elige', async () => {
    const start = await handleSalesMessage('cotización', null, deps());
    const list = await handleSalesMessage('balata', start.session, deps([BALATA, BALATA2]));
    expect(list.session?.state).toBe('pick');
    expect(list.reply).toContain('1. Balata cerámica');
    expect(list.reply).toContain('2. Balata semimetálica');
    const picked = await handleSalesMessage('2', list.session, deps());
    expect(picked.session?.state).toBe('qty');
    expect(picked.session?.pending?.sku).toBe('BAL-S220');
  });

  it('cantidad agrega al carrito y ofrece seguir o cerrar', async () => {
    const s: SalesSession = {
      state: 'qty', docType: 'cotizacion', customerId: null, customerName: null,
      candidates: [], pending: BALATA, cart: [],
    };
    const r = await handleSalesMessage('4 pzas', s, deps());
    expect(r.session?.cart).toHaveLength(1);
    expect(r.session?.cart[0].qty).toBe(4);
    expect(r.session?.state).toBe('product');
    expect(r.reply).toContain('listo');
  });

  it('cantidad inválida re-pregunta sin perder el pendiente', async () => {
    const s: SalesSession = {
      state: 'qty', docType: 'pedido', customerId: null, customerName: null,
      candidates: [], pending: ACEITE, cart: [],
    };
    const r = await handleSalesMessage('no sé', s, deps());
    expect(r.session?.state).toBe('qty');
    expect(r.session?.pending?.id).toBe('v3');
  });

  it('«listo» con carrito muestra resumen con totales y pasa a confirmar', async () => {
    const s: SalesSession = {
      state: 'product', docType: 'cotizacion', customerId: null, customerName: null,
      candidates: [], pending: null,
      cart: [{ variantId: 'v1', sku: 'BAL-1184', name: 'Balata', qty: 2, price: 360, ivaRate: 0.16 }],
    };
    const r = await handleSalesMessage('listo', s, deps());
    expect(r.session?.state).toBe('confirm');
    expect(r.reply).toContain('$835.20'); // 720 + 115.20 IVA
  });

  it('«listo» sin partidas pide agregar producto', async () => {
    const start = await handleSalesMessage('pedido', null, deps());
    const r = await handleSalesMessage('listo', start.session, deps());
    expect(r.session?.state).toBe('product');
    expect(r.reply).toContain('Aún no agregas');
  });

  it('«sí» en confirmación crea el documento y cierra la sesión', async () => {
    const d = deps([], 'PED-A-0003');
    const s: SalesSession = {
      state: 'confirm', docType: 'pedido', customerId: 'c1', customerName: 'Jorge',
      candidates: [], pending: null,
      cart: [{ variantId: 'v1', sku: 'BAL-1184', name: 'Balata', qty: 2, price: 360, ivaRate: 0.16 }],
    };
    const r = await handleSalesMessage('sí', s, d);
    expect(d.createDocument).toHaveBeenCalledOnce();
    expect(r.session).toBeNull();
    expect(r.reply).toContain('PED-A-0003');
    expect(r.reply).toContain('$835.20');
  });

  it('«cancelar» en cualquier punto limpia la sesión', async () => {
    const s: SalesSession = {
      state: 'confirm', docType: 'cotizacion', customerId: null, customerName: null,
      candidates: [], pending: null,
      cart: [{ variantId: 'v1', sku: 'X', name: 'X', qty: 1, price: 10, ivaRate: 0.16 }],
    };
    const r = await handleSalesMessage('cancelar', s, deps());
    expect(r.session).toBeNull();
    expect(r.reply.toLowerCase()).toContain('cancel');
  });

  it('sin resultados sugiere reintentar y mantiene la sesión', async () => {
    const start = await handleSalesMessage('cotización', null, deps());
    const r = await handleSalesMessage('turbina nuclear', start.session, deps([]));
    expect(r.session?.state).toBe('product');
    expect(r.reply).toContain('No encontré');
  });
});

describe('escape de qty con «listo»', () => {
  it('descarta el pendiente y muestra el resumen si hay carrito', async () => {
    const s: SalesSession = {
      state: 'qty', docType: 'cotizacion', customerId: null, customerName: null,
      candidates: [], pending: ACEITE,
      cart: [{ variantId: 'v1', sku: 'BAL-1184', name: 'Balata', qty: 3, price: 100, ivaRate: 0.16 }],
    };
    const r = await handleSalesMessage('listo', s, deps());
    expect(r.session?.state).toBe('confirm');
    expect(r.session?.pending).toBeNull();
    expect(r.reply).toContain('$348.00');
  });
});
