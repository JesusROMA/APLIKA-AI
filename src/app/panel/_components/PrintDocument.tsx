'use client';

/**
 * PrintDocument — vista imprimible de un documento de ventas (compartida F1).
 * Sin librerías: HTML/CSS puro. El botón "Imprimir" llama window.print() y se
 * oculta en impresión (.no-print). Los estilos de hoja viven en print.css.
 */

import type { DocLine, DocTotals } from '@/lib/types/erp-ventas';

export interface PrintableDoc {
  orgName: string;
  brandColor?: string; // opcional; default var(--brand)
  logoUrl?: string | null; // opcional
  docTitle: string; // "Cotización", "Remisión", "Factura", "Pedido"
  folio: string;
  status?: string;
  date: string; // ISO; se formatea es-MX
  customer: { name: string; rfc?: string | null; extra?: string | null } | null; // null ⇒ Público en general
  lines: DocLine[];
  totals: DocTotals;
  meta?: { label: string; value: string }[]; // pares extra (vigencia, método de pago…)
  notes?: string | null;
  footerNote?: string | null;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

export function PrintDocument({ doc }: { doc: PrintableDoc }) {
  // Color de acento por documento; default al token de marca.
  const rootStyle = {
    ['--doc-brand']: doc.brandColor ?? 'var(--brand)',
  } as React.CSSProperties;

  return (
    <div className="print-doc" style={rootStyle}>
      <div className="no-print print-actions">
        <button type="button" className="pbtn pbtn--primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <article className="print-sheet">
        <header className="print-head">
          <div className="print-head-org">
            {doc.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="print-logo" src={doc.logoUrl} alt={doc.orgName} />
            ) : (
              <span className="print-org-name">{doc.orgName}</span>
            )}
          </div>
          <div className="print-head-doc">
            <h1 className="print-doc-title">{doc.docTitle}</h1>
            <p className="print-doc-folio">{doc.folio}</p>
            {doc.status && <p className="print-doc-status">{doc.status}</p>}
            <p className="print-doc-date">{formatDate(doc.date)}</p>
          </div>
        </header>

        <section className="print-parties">
          <div className="print-party">
            <h2 className="print-party-title">Cliente</h2>
            {doc.customer ? (
              <>
                <p className="print-party-name">{doc.customer.name}</p>
                {doc.customer.rfc && <p className="print-party-line">RFC: {doc.customer.rfc}</p>}
                {doc.customer.extra && <p className="print-party-line">{doc.customer.extra}</p>}
              </>
            ) : (
              <p className="print-party-name">Público en general</p>
            )}
          </div>

          {doc.meta && doc.meta.length > 0 && (
            <dl className="print-meta">
              {doc.meta.map((m, i) => (
                <div className="print-meta-row" key={i}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <table className="print-table">
          <thead>
            <tr>
              <th className="print-c-sku">SKU</th>
              <th className="print-c-desc">Descripción</th>
              <th className="print-c-num">Cant.</th>
              <th className="print-c-num">Precio</th>
              <th className="print-c-num">Desc.</th>
              <th className="print-c-num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="print-c-sku">{l.sku ?? '—'}</td>
                <td className="print-c-desc">{l.name}</td>
                <td className="print-c-num">{l.qty}</td>
                <td className="print-c-num">{MXN.format(l.unitPrice)}</td>
                <td className="print-c-num">{l.discountPct ? `${l.discountPct}%` : '—'}</td>
                <td className="print-c-num">{MXN.format(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-totals">
          <div className="print-total-row">
            <span>Subtotal</span>
            <span>{MXN.format(doc.totals.subtotal)}</span>
          </div>
          {doc.totals.descuento > 0 && (
            <div className="print-total-row">
              <span>Descuento</span>
              <span>−{MXN.format(doc.totals.descuento)}</span>
            </div>
          )}
          <div className="print-total-row">
            <span>IVA</span>
            <span>{MXN.format(doc.totals.tax)}</span>
          </div>
          <div className="print-total-row print-total-row--grand">
            <span>Total</span>
            <span>{MXN.format(doc.totals.total)}</span>
          </div>
        </div>

        {doc.notes && (
          <section className="print-notes">
            <h2 className="print-notes-title">Notas</h2>
            <p className="print-notes-body">{doc.notes}</p>
          </section>
        )}

        {doc.footerNote && <footer className="print-foot">{doc.footerNote}</footer>}
      </article>
    </div>
  );
}
