/**
 * Bot de ventas por WhatsApp — máquina de estados PURA (sin I/O).
 * El webhook de Twilio le pasa el mensaje + la sesión guardada y unas `deps`
 * (buscar productos, crear documento); aquí solo se decide qué contestar y
 * cómo queda la sesión. Determinista y testeable (tests/whatsapp-sales.test.ts).
 *
 * Flujo: "cotización" | "pedido" → buscar producto → (elegir de la lista) →
 * cantidad → repetir o "listo" → resumen con totales → "sí" crea el documento
 * (misma fórmula de totales que el servidor: partida → IVA → total).
 */

export interface VariantHit {
  id: string;
  sku: string;
  name: string;
  price: number;
  ivaRate: number;
  stock: number;
}

export interface CartItem {
  variantId: string;
  sku: string;
  name: string;
  qty: number;
  price: number;
  ivaRate: number;
}

export type DocType = 'cotizacion' | 'pedido';

export interface SalesSession {
  state: 'product' | 'pick' | 'qty' | 'confirm';
  docType: DocType;
  customerId: string | null;
  customerName: string | null;
  candidates: VariantHit[];
  pending: VariantHit | null;
  cart: CartItem[];
}

export interface SalesDeps {
  /** Busca variantes del tenant (precio ya resuelto para el cliente). */
  searchProducts(term: string): Promise<VariantHit[]>;
  /** Crea la cotización o el pedido; regresa folio y total. */
  createDocument(docType: DocType, cart: CartItem[]): Promise<{ folio: string; total: number }>;
}

export interface SalesResult {
  /** false = el mensaje no es de ventas; el webhook sigue con citas/auto-respuestas. */
  handled: boolean;
  reply: string;
  /** null = sesión terminada/cancelada (borrar de BD). */
  session: SalesSession | null;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const START_QUOTE = /\b(cotizaci[oó]n|cotizar|cotiza(me)?)\b/i;
const START_ORDER = /\b(pedido|ordenar|orden\b|comprar)\b/i;
const CATALOG = /\b(cat[aá]logo|productos)\b/i;
const DONE = /^\s*(listo|terminar|finalizar|cerrar|ya)\s*$/i;
const CANCEL = /^\s*(cancelar|cancela|salir|olvidalo|olvídalo)\s*$/i;
const YES = /^\s*(s[ií]|si+|confirmo|confirmar|ok|dale|va)\s*[.!]?\s*$/i;

function docLabel(t: DocType): string {
  return t === 'cotizacion' ? 'cotización' : 'pedido';
}

export function computeTotals(cart: CartItem[]): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;
  for (const l of cart) {
    const line = l.qty * l.price;
    subtotal += line;
    tax += line * l.ivaRate;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

function cartLines(cart: CartItem[]): string {
  return cart
    .map((l) => `• ${l.qty} × ${l.name} (${l.sku}) — ${MXN.format(l.qty * l.price)}`)
    .join('\n');
}

function summary(session: SalesSession): string {
  const { subtotal, tax, total } = computeTotals(session.cart);
  return (
    `Resumen de tu ${docLabel(session.docType)}:\n${cartLines(session.cart)}\n` +
    `Subtotal: ${MXN.format(subtotal)} · IVA: ${MXN.format(tax)}\n*Total: ${MXN.format(total)}*\n\n` +
    `Responde *sí* para confirmar, escribe otro producto para agregar más, o *cancelar*.`
  );
}

function candidateList(hits: VariantHit[]): string {
  return hits
    .map((v, i) => `${i + 1}. ${v.name} (${v.sku}) — ${MXN.format(v.price)} · ${v.stock} disp.`)
    .join('\n');
}

function askProduct(session: SalesSession): string {
  return session.cart.length === 0
    ? `Va tu ${docLabel(session.docType)} 📝 ¿Qué producto necesitas? Escribe el nombre o SKU (ej. «balata» o «BAL-1184»).`
    : `¿Qué otro producto agrego? O escribe *listo* para cerrar tu ${docLabel(session.docType)}.`;
}

/** Cantidad: acepta "3", "3 pzas", "x3", "quiero 3". */
function parseQty(body: string): number | null {
  const m = body.match(/\d{1,5}/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n > 0 ? n : null;
}

function newSession(docType: DocType, customer?: { id: string; name: string } | null): SalesSession {
  return {
    state: 'product',
    docType,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    candidates: [],
    pending: null,
    cart: [],
  };
}

/**
 * Avanza la conversación de ventas un mensaje. `session` es la guardada (o
 * null); `customer` es el cliente ya identificado por teléfono (o null).
 */
export async function handleSalesMessage(
  body: string,
  session: SalesSession | null,
  deps: SalesDeps,
  customer?: { id: string; name: string } | null,
): Promise<SalesResult> {
  const text = body.trim();

  // --- Sin sesión: ¿arranca un flujo de ventas? ---
  if (!session) {
    const docType: DocType | null = START_QUOTE.test(text)
      ? 'cotizacion'
      : START_ORDER.test(text)
        ? 'pedido'
        : null;
    if (docType) {
      const s = newSession(docType, customer);
      const hola = customer?.name ? `¡Hola, ${customer.name.split(/\s+/)[0]}! ` : '';
      return { handled: true, reply: hola + askProduct(s), session: s };
    }
    if (CATALOG.test(text)) {
      const hits = (await deps.searchProducts('')).slice(0, 8);
      const list = hits.length ? candidateList(hits) : 'Aún no hay productos en el catálogo.';
      return {
        handled: true,
        reply: `Nuestro catálogo (muestra):\n${list}\n\nEscribe *cotización* o *pedido* para empezar.`,
        session: null,
      };
    }
    return { handled: false, reply: '', session: null };
  }

  // --- Con sesión activa ---
  if (CANCEL.test(text)) {
    return {
      handled: true,
      reply: `Listo, cancelé tu ${docLabel(session.docType)} 👍 Escribe *cotización* o *pedido* cuando quieras empezar de nuevo.`,
      session: null,
    };
  }

  switch (session.state) {
    case 'pick': {
      const n = /^\s*\d{1,2}\s*[.)]?\s*$/.test(text) ? parseInt(text, 10) : NaN;
      if (n >= 1 && n <= session.candidates.length) {
        const v = session.candidates[n - 1];
        return {
          handled: true,
          reply: `${v.name} (${v.sku}) a ${MXN.format(v.price)} c/u. ¿Cuántas piezas?`,
          session: { ...session, state: 'qty', pending: v, candidates: [] },
        };
      }
      // No eligió número: se toma como nueva búsqueda.
      return searchStep(text, { ...session, state: 'product', candidates: [] }, deps);
    }

    case 'qty': {
      // «listo» aquí descarta el producto pendiente y cierra (o vuelve a pedir
      // producto si el carrito sigue vacío) — que nadie se quede atorado.
      if (DONE.test(text)) {
        if (session.cart.length === 0) {
          return {
            handled: true,
            reply: `Aún no agregas productos 🙂 ¿Cuántas piezas de ${session.pending?.name ?? 'ese producto'}? O escribe *cancelar*.`,
            session,
          };
        }
        return {
          handled: true,
          reply: summary({ ...session, pending: null }),
          session: { ...session, state: 'confirm', pending: null },
        };
      }
      const qty = parseQty(text);
      const v = session.pending;
      if (!qty || !v) {
        return {
          handled: true,
          reply: `¿Cuántas piezas de ${v?.name ?? 'ese producto'}? Escribe solo el número (ej. «3»), o *cancelar*.`,
          session,
        };
      }
      const cart = [
        ...session.cart,
        { variantId: v.id, sku: v.sku, name: v.name, qty, price: v.price, ivaRate: v.ivaRate },
      ];
      const s: SalesSession = { ...session, state: 'product', pending: null, cart };
      const { total } = computeTotals(cart);
      return {
        handled: true,
        reply:
          `Agregado ✅ ${qty} × ${v.name} — ${MXN.format(qty * v.price)}\n` +
          `Llevas ${cart.length} partida${cart.length === 1 ? '' : 's'}, total ${MXN.format(total)} (IVA incluido).\n\n` +
          askProduct(s),
        session: s,
      };
    }

    case 'confirm': {
      if (YES.test(text)) {
        const { folio, total } = await deps.createDocument(session.docType, session.cart);
        const cierre =
          session.docType === 'cotizacion'
            ? 'Te la hacemos llegar en breve.'
            : 'En un momento te confirmamos la entrega y el pago.';
        const registrado = session.docType === 'cotizacion' ? 'registrada' : 'registrado';
        return {
          handled: true,
          reply: `✅ ¡Listo! Tu ${docLabel(session.docType)} *${folio}* quedó ${registrado} por *${MXN.format(total)}*. ${cierre}`,
          session: null,
        };
      }
      if (DONE.test(text)) {
        return { handled: true, reply: summary(session), session };
      }
      // Cualquier otro texto: quiere agregar algo más.
      return searchStep(text, { ...session, state: 'product' }, deps);
    }

    case 'product':
    default: {
      if (DONE.test(text)) {
        if (session.cart.length === 0) {
          return {
            handled: true,
            reply: `Aún no agregas productos 🙂 Escribe el nombre o SKU de lo que necesitas, o *cancelar*.`,
            session,
          };
        }
        return { handled: true, reply: summary(session), session: { ...session, state: 'confirm' } };
      }
      return searchStep(text, session, deps);
    }
  }
}

/** Busca el término y decide: sin resultados / único (pide cantidad) / lista. */
async function searchStep(term: string, session: SalesSession, deps: SalesDeps): Promise<SalesResult> {
  const hits = (await deps.searchProducts(term)).slice(0, 5);
  if (hits.length === 0) {
    return {
      handled: true,
      reply: `No encontré «${term}» 😕 Intenta con otra palabra o el SKU. También puedes escribir *listo* o *cancelar*.`,
      session: { ...session, state: 'product' },
    };
  }
  if (hits.length === 1) {
    const v = hits[0];
    return {
      handled: true,
      reply: `${v.name} (${v.sku}) a ${MXN.format(v.price)} c/u · ${v.stock} disp. ¿Cuántas piezas?`,
      session: { ...session, state: 'qty', pending: v, candidates: [] },
    };
  }
  return {
    handled: true,
    reply: `Encontré esto:\n${candidateList(hits)}\n\nResponde con el número (1-${hits.length}) o busca con otra palabra.`,
    session: { ...session, state: 'pick', candidates: hits, pending: null },
  };
}
