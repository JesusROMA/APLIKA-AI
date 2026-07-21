import type { DocLine, DocTotals } from '@/lib/types/erp-ventas';

/**
 * FÓRMULAS DE TOTALES (C1.8) — PURAS, sin dependencias de servidor, para que
 * tanto los endpoints como el editor de partidas del panel (cliente) usen
 * EXACTAMENTE el mismo cálculo. PROPIEDAD DEL ORQUESTADOR (pieza compartida F1).
 */

/** Redondeo a 2 decimales estable ante ruido de punto flotante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Importe de una partida: qty × precio × (1 − descuento_partida). */
export function lineTotalOf(qty: number, unitPrice: number, discountPct = 0): number {
  return round2(qty * unitPrice * (1 - (discountPct || 0) / 100));
}

/**
 * Totales del documento. El descuento global se prorratea sobre la base de cada
 * partida antes de calcular su IVA:
 *   subtotal = Σ lineTotal
 *   descuento = round(subtotal × descGlobal%)
 *   tax = Σ round(lineTotal × (1 − descGlobal%) × ivaRate)
 *   total = subtotal − descuento + tax
 */
export function computeTotals(
  lines: Pick<DocLine, 'lineTotal' | 'ivaRate'>[],
  descuentoGlobalPct = 0,
): DocTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const descuento = round2((subtotal * (descuentoGlobalPct || 0)) / 100);
  const factor = 1 - (descuentoGlobalPct || 0) / 100;
  const tax = round2(
    lines.reduce((s, l) => s + round2(l.lineTotal * factor * (l.ivaRate || 0)), 0),
  );
  const total = round2(subtotal - descuento + tax);
  return { subtotal, descuento, tax, total };
}
