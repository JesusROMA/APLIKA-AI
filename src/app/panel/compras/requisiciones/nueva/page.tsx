'use client';

/**
 * Alta de requisición (F6 · Tanda B, módulo `compras`). Notas + editor de
 * partidas (ProductPicker + cantidad + costo estimado). Se crea en borrador; al
 * guardar navega al detalle. El server es la autoridad (RLS + guards).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createRequisition } from '../../../_lib/requisiciones';
import { useCan } from '../../../_components/session';
import { ReadOnlyBadge } from '../../../_components/States';
import { ReqLinesEditor, type ReqEditorLine } from '../_components/ReqLinesEditor';

export default function NuevaRequisicionPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('compras', 'crear');

  const [notas, setNotas] = useState('');
  const [lines, setLines] = useState<ReqEditorLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError =
    lines.length === 0
      ? 'Agrega al menos una partida.'
      : lines.some((l) => !(l.qty > 0))
        ? 'Cada partida requiere una cantidad mayor a 0.'
        : lines.some((l) => !l.productVariantId && !l.name.trim())
          ? 'Las partidas libres requieren un concepto.'
          : null;

  const canSubmit = canCreate && !validationError && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createRequisition({
        notas: notas.trim() || null,
        lines: lines.map((l) => ({
          productVariantId: l.productVariantId,
          sku: l.sku,
          name: l.name.trim() || undefined,
          qty: l.qty,
          estimatedCost: l.estimatedCost,
        })),
      });
      router.push(`/panel/compras/requisiciones/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la requisición.');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva requisición</h2>
          <p className="panel-page-sub">Crea una solicitud interna de compra en borrador.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras/requisiciones">
          Volver
        </Link>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <ReqLinesEditor value={lines} onChange={setLines} disabled={!canCreate} />

        <div className="panel-field" style={{ marginTop: 'var(--sp-2)' }}>
          <label className="panel-field-label" htmlFor="req-notas">
            Notas
          </label>
          <textarea
            id="req-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Justificación, área solicitante…"
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </fieldset>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'var(--sp-2)',
          marginTop: 'var(--sp-3)',
        }}
      >
        {!canCreate && <ReadOnlyBadge />}
        {validationError && canCreate && <span className="panel-field-hint">{validationError}</span>}
        <button
          type="button"
          className="pbtn pbtn--ghost"
          onClick={() => router.push('/panel/compras/requisiciones')}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Crear requisición'}
        </button>
      </div>
    </div>
  );
}
