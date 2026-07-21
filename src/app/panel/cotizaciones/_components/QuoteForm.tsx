'use client';

/**
 * Formulario de cotización (alta y edición de borrador). Reúne las piezas
 * compartidas F1: CustomerPicker + DocLinesEditor (con descuento global) y los
 * campos de vigencia/notas. Los totales los pinta DocLinesEditor con las mismas
 * fórmulas del servidor; el guardado real lo hace el padre vía `onSubmit`.
 */

import { useState } from 'react';
import type { DocLineInput } from '@/lib/types/erp-ventas';
import type { QuoteInput } from '../../_lib/cotizaciones';
import { CustomerPicker } from '../../_components/CustomerPicker';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { NumberField } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';

export interface QuoteFormInitial {
  customerId: string | null;
  lines: DocLineInput[];
  descuentoGlobalPct: number;
  vigenciaDias: number;
  notas: string;
}

const EMPTY: QuoteFormInitial = {
  customerId: null,
  lines: [],
  descuentoGlobalPct: 0,
  vigenciaDias: 15,
  notas: '',
};

interface Props {
  initial?: QuoteFormInitial;
  canEdit: boolean;
  submitLabel: string;
  onSubmit: (body: QuoteInput) => Promise<void>;
  onCancel: () => void;
}

export function QuoteForm({ initial, canEdit, submitLabel, onSubmit, onCancel }: Props) {
  const seed = initial ?? EMPTY;
  const [customerId, setCustomerId] = useState<string | null>(seed.customerId);
  const [lines, setLines] = useState<DocLineInput[]>(seed.lines);
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState<number>(seed.descuentoGlobalPct);
  const [vigenciaDias, setVigenciaDias] = useState<number | ''>(seed.vigenciaDias);
  const [notas, setNotas] = useState<string>(seed.notas);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLines = lines.length > 0;
  const freeLineMissingName = lines.some((l) => !l.productVariantId && !(l.name && l.name.trim()));
  const invalidQty = lines.some((l) => !(Number(l.qty) > 0));
  const validationError = !hasLines
    ? 'Agrega al menos una partida.'
    : freeLineMissingName
      ? 'Las líneas libres requieren descripción.'
      : invalidQty
        ? 'Cada partida requiere una cantidad mayor a 0.'
        : null;

  const canSubmit = canEdit && !validationError && vigenciaDias !== '' && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        customerId,
        // Narrowed a number por la guarda `if (!canSubmit) return`.
        vigenciaDias: Number(vigenciaDias),
        descuentoGlobalPct,
        notas: notas.trim() || undefined,
        lines,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <div className="f1-form">
      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-form-grid">
          <CustomerPicker value={customerId} onChange={(id) => setCustomerId(id)} allowPublico />
          <NumberField
            label="Vigencia (días)"
            name="vigenciaDias"
            value={vigenciaDias}
            onChange={setVigenciaDias}
            min={1}
          />
        </div>

        <DocLinesEditor
          customerId={customerId}
          lines={lines}
          onChange={setLines}
          descuentoGlobalPct={descuentoGlobalPct}
          onDescuentoGlobalChange={setDescuentoGlobalPct}
        />

        <div className="panel-field">
          <label className="panel-field-label" htmlFor="quote-notas">
            Notas
          </label>
          <textarea
            id="quote-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Condiciones, comentarios para el cliente…"
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </fieldset>

      <div className="f1-form-actions">
        {!canEdit && <ReadOnlyBadge />}
        {validationError && canEdit && <span className="panel-field-hint">{validationError}</span>}
        <button type="button" className="pbtn pbtn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
