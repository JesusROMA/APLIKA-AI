'use client';

/**
 * Alta de factura en borrador. Cliente (requerido) + método/forma de pago SAT +
 * editor de partidas. Los totales son informativos (el servidor recalcula).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocLineInput, MetodoPago } from '@/lib/types/erp-ventas';
import { createInvoice } from '../../_lib/facturacion';
import { getVentasCatalogs } from '../../_lib/ventas-api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { CustomerPicker } from '../../_components/CustomerPicker';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { SelectField, type SelectOption } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';

const METODO_OPTS: SelectOption[] = [
  { value: 'PUE', label: 'PUE · Pago en una sola exhibición' },
  { value: 'PPD', label: 'PPD · Pago en parcialidades o diferido' },
];

export default function NuevaFacturaPage() {
  const can = useCan();
  const canCreate = can('facturacion', 'crear');
  const router = useRouter();
  const catalogs = useAsyncData(getVentasCatalogs);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('PUE');
  const [formaPago, setFormaPago] = useState('');
  const [lines, setLines] = useState<DocLineInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formaOpts: SelectOption[] = useMemo(
    () => (catalogs.data?.formaPago ?? []).map((f) => ({ value: f.code, label: `${f.code} · ${f.label}` })),
    [catalogs.data],
  );

  const canSubmit = canCreate && Boolean(customerId) && lines.length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit || !customerId) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createInvoice({
        customerId,
        metodoPago,
        formaPago: formaPago || undefined,
        lines,
      });
      router.push(`/panel/facturacion/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la factura.');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva factura</h2>
          <p className="panel-page-sub">Se crea en borrador; podrás timbrarla desde el detalle.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/facturacion">
          Volver
        </Link>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <CustomerPicker value={customerId} onChange={(id) => setCustomerId(id)} />
        <div className="panel-form-grid">
          <SelectField
            label="Método de pago"
            name="metodoPago"
            value={metodoPago}
            onChange={(v) => setMetodoPago(v as MetodoPago)}
            options={METODO_OPTS}
          />
          <SelectField
            label="Forma de pago"
            name="formaPago"
            value={formaPago}
            onChange={setFormaPago}
            options={formaOpts}
            placeholder="Sin especificar"
          />
        </div>
      </div>

      <DocLinesEditor customerId={customerId} lines={lines} onChange={setLines} />

      <div className="panel-page-foot" style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
        {!canCreate && <ReadOnlyBadge />}
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Crear factura'}
        </button>
      </div>
    </div>
  );
}
