'use client';

/**
 * Series de folio del tenant. Tabla (doc_type, serie, prefix, próximo) + alta y
 * edición vía drawer. Escritura gated por config/configurar.
 */

import { useState } from 'react';
import type { ConfigSeriesRow } from '@/lib/types/erp-config';
import { getSeries, createSeries, updateSeries } from '../../_lib/config';
import { useAsyncData } from '../../_lib/hooks';
import { LoadingState, ErrorState, Badge, ReadOnlyBadge } from '../../_components/States';
import { Drawer } from '../../_components/Drawer';
import { TextField, NumberField } from '../../_components/Field';

type Draft = 'new' | ConfigSeriesRow | null;

export function SeriesTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useAsyncData(getSeries);
  const [draft, setDraft] = useState<Draft>(null);

  if (loading) return <LoadingState label="Cargando series…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Series de folio
          </h3>
          <p className="panel-page-sub">Numeración por tipo de documento.</p>
        </div>
        {canWrite ? (
          <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
            + Nueva serie
          </button>
        ) : (
          <ReadOnlyBadge />
        )}
      </div>

      <div className="panel-table-wrap">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Serie</th>
              <th>Prefijo</th>
              <th className="panel-table-num">Próximo</th>
              <th>Predet.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Sin series registradas.</td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={canWrite ? () => setDraft(s) : undefined}
                  style={canWrite ? { cursor: 'pointer' } : undefined}
                >
                  <td>{s.docType}</td>
                  <td>
                    <strong>{s.serie}</strong>
                  </td>
                  <td>{s.prefix || '—'}</td>
                  <td className="panel-table-num">{s.nextValue}</td>
                  <td>{s.isDefault ? <Badge tone="on">Sí</Badge> : <Badge tone="off">No</Badge>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {draft !== null && (
        <SeriesDrawer
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SeriesDrawer({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = draft === 'new';
  const existing = isNew || draft === null ? null : draft;
  const [docType, setDocType] = useState(existing?.docType ?? '');
  const [serie, setSerie] = useState(existing?.serie ?? '');
  const [prefix, setPrefix] = useState(existing?.prefix ?? '');
  const [nextValue, setNextValue] = useState<number | ''>(existing?.nextValue ?? 1);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const docTypeError = isNew && docType.trim() === '' ? 'El tipo es obligatorio.' : null;
  const serieError = serie.trim() === '' ? 'La serie es obligatoria.' : null;
  const canSubmit = !docTypeError && !serieError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    try {
      if (isNew) {
        await createSeries({
          docType: docType.trim(),
          serie: serie.trim(),
          prefix: prefix.trim(),
          nextValue: nextValue === '' ? 1 : nextValue,
        });
      } else {
        await updateSeries(existing!.id, {
          serie: serie.trim(),
          prefix: prefix.trim(),
          nextValue: nextValue === '' ? undefined : nextValue,
        });
      }
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nueva serie' : 'Editar serie'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      {serverError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {serverError}
        </p>
      )}
      {isNew ? (
        <TextField
          label="Tipo de documento"
          name="docType"
          value={docType}
          onChange={setDocType}
          required
          error={docTypeError}
          hint="Ej. invoice, quote, order."
        />
      ) : (
        <div className="panel-field">
          <span className="panel-field-label">Tipo de documento</span>
          <p style={{ margin: 0 }}>
            <strong>{docType}</strong>
          </p>
        </div>
      )}
      <TextField
        label="Serie"
        name="serie"
        value={serie}
        onChange={setSerie}
        required
        error={serieError}
        hint="Ej. A, B, F."
      />
      <TextField label="Prefijo" name="prefix" value={prefix} onChange={setPrefix} hint="Opcional." />
      <NumberField
        label="Próximo folio"
        name="nextValue"
        value={nextValue}
        onChange={setNextValue}
        min={1}
        step={1}
      />
    </Drawer>
  );
}
