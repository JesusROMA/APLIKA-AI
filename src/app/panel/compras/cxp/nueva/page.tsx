'use client';

/**
 * Alta de factura de proveedor. Proveedor (requerido) + folio del proveedor +
 * fecha + método/forma de pago + partidas (nombre, cantidad, costo, IVA). Las
 * partidas solo alimentan los totales; el servidor recalcula y las descarta.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupplierRow } from '@/lib/types/erp-compras';
import { createSupplierInvoice, listSuppliers, type SupplierInvoiceLineInput } from '../../../_lib/cxp';
import { useCan } from '../../../_components/session';
import { TextField, SelectField, type SelectOption } from '../../../_components/Field';
import { ReadOnlyBadge } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface LineDraft {
  name: string;
  qty: number | '';
  unitCost: number | '';
  ivaRate: number | '';
}

const emptyLine: LineDraft = { name: '', qty: 1, unitCost: 0, ivaRate: 0.16 };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function NuevaSupplierInvoicePage() {
  const can = useCan();
  const canCreate = can('compras', 'crear');
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [folio, setFolio] = useState('');
  const [uuid, setUuid] = useState('');
  const [fecha, setFecha] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSuppliers({ page: 1, pageSize: 100, status: 'activo' })
      .then((res) => setSuppliers(res.data))
      .catch(() => setSuppliers([]));
  }, []);

  const supplierOpts: SelectOption[] = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const qty = Number(l.qty) || 0;
      const cost = Number(l.unitCost) || 0;
      const iva = Number(l.ivaRate) || 0;
      const lt = round2(qty * cost);
      subtotal += lt;
      tax += round2(lt * iva);
    }
    subtotal = round2(subtotal);
    tax = round2(tax);
    return { subtotal, tax, total: round2(subtotal + tax) };
  }, [lines]);

  const validLines = lines.filter(
    (l) => l.name.trim() && Number(l.qty) > 0 && Number(l.unitCost) >= 0,
  );
  const canSubmit = canCreate && Boolean(supplierId) && Boolean(folio.trim()) && validLines.length > 0 && !saving;

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const payload: SupplierInvoiceLineInput[] = validLines.map((l) => ({
        name: l.name.trim(),
        qty: Number(l.qty),
        unitCost: Number(l.unitCost),
        ivaRate: l.ivaRate === '' ? undefined : Number(l.ivaRate),
      }));
      const { id } = await createSupplierInvoice({
        supplierId,
        folio: folio.trim(),
        uuid: uuid.trim() || undefined,
        fecha: fecha || undefined,
        metodoPago: metodoPago.trim() || undefined,
        formaPago: formaPago.trim() || undefined,
        lines: payload,
      });
      router.push(`/panel/compras/cxp/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la factura.');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Registrar factura de proveedor</h2>
          <p className="panel-page-sub">Se registra con saldo pendiente y aumenta la cuenta por pagar.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras/cxp">
          Volver
        </Link>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <div className="panel-form-grid">
          <SelectField
            label="Proveedor"
            name="supplierId"
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOpts}
            required
            placeholder="Selecciona proveedor…"
          />
          <TextField label="Folio del proveedor" name="folio" value={folio} onChange={setFolio} required />
          <TextField label="UUID (opcional)" name="uuid" value={uuid} onChange={setUuid} />
          <TextField label="Fecha" name="fecha" type="date" value={fecha} onChange={setFecha} />
          <TextField label="Método de pago" name="metodoPago" value={metodoPago} onChange={setMetodoPago} />
          <TextField label="Forma de pago" name="formaPago" value={formaPago} onChange={setFormaPago} />
        </div>
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <h3 className="panel-page-title" style={{ fontSize: '1rem', margin: 0 }}>Partidas</h3>
          <button type="button" className="pbtn pbtn--ghost" onClick={addLine}>
            + Agregar partida
          </button>
        </div>
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Costo unitario</th>
                <th className="panel-table-num">IVA</th>
                <th className="panel-table-num">Importe</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      className="panel-input"
                      value={l.name}
                      placeholder="Concepto"
                      onChange={(e) => setLine(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input"
                      value={l.qty}
                      min={0}
                      step="any"
                      onChange={(e) => setLine(i, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input"
                      value={l.unitCost}
                      min={0}
                      step="any"
                      onChange={(e) => setLine(i, { unitCost: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input"
                      value={l.ivaRate}
                      min={0}
                      max={1}
                      step="any"
                      onChange={(e) => setLine(i, { ivaRate: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td className="panel-table-num">
                    {MXN.format(round2((Number(l.qty) || 0) * (Number(l.unitCost) || 0)))}
                  </td>
                  <td className="panel-table-num">
                    {lines.length > 1 && (
                      <button type="button" className="pbtn pbtn--ghost" onClick={() => removeLine(i)}>
                        Quitar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="f1-totals" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="f1-totals-row">
          <span className="f1-totals-label">Subtotal</span>
          <span className="f1-totals-value">{MXN.format(totals.subtotal)}</span>
        </div>
        <div className="f1-totals-row">
          <span className="f1-totals-label">IVA</span>
          <span className="f1-totals-value">{MXN.format(totals.tax)}</span>
        </div>
        <div className="f1-totals-row f1-totals-row--grand">
          <span className="f1-totals-label">Total</span>
          <span className="f1-totals-value">{MXN.format(totals.total)}</span>
        </div>
      </div>

      <div className="panel-page-foot" style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        {!canCreate && <ReadOnlyBadge />}
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Registrar factura'}
        </button>
      </div>
    </div>
  );
}
