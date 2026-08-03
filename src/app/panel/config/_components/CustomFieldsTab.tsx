'use client';

/**
 * Campos personalizados por módulo. Selector de módulo + lista de defs y
 * alta/edición/baja vía drawer (label, key, tipo, requerido, opciones si select,
 * orden, activo). Escritura gated por config/configurar.
 */

import { useCallback, useState } from 'react';
import type { CustomFieldDef, CustomFieldType } from '@/lib/types/erp-config';
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
} from '../../_lib/config';
import { useAsyncData } from '../../_lib/hooks';
import { LoadingState, ErrorState, Badge, ReadOnlyBadge } from '../../_components/States';
import { Drawer } from '../../_components/Drawer';
import { TextField, NumberField, SelectField, CheckboxField } from '../../_components/Field';

const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'clientes', label: 'Clientes' },
  { value: 'productos', label: 'Productos' },
  { value: 'ordenes', label: 'Pedidos' },
  { value: 'cotizaciones', label: 'Cotizaciones' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'expediente', label: 'Expediente' },
  { value: 'crm', label: 'CRM' },
  { value: 'calendario', label: 'Agenda' },
];

const TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Lista (select)' },
  { value: 'boolean', label: 'Sí/No' },
];

const TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Lista',
  boolean: 'Sí/No',
};

type Draft = 'new' | CustomFieldDef | null;

export function CustomFieldsTab({ canWrite }: { canWrite: boolean }) {
  const [moduleKey, setModuleKey] = useState('clientes');
  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Campos personalizados
          </h3>
          <p className="panel-page-sub">Campos extra por módulo, guardados en el JSON del registro.</p>
        </div>
        {!canWrite && <ReadOnlyBadge />}
      </div>

      <div style={{ maxWidth: 280, marginBottom: 'var(--sp-2)' }}>
        <SelectField
          label="Módulo"
          name="module"
          value={moduleKey}
          onChange={setModuleKey}
          options={MODULE_OPTIONS}
        />
      </div>

      {/* key={moduleKey}: remonta al cambiar de módulo para releer la lista. */}
      <CustomFieldList key={moduleKey} moduleKey={moduleKey} canWrite={canWrite} />
    </div>
  );
}

function CustomFieldList({ moduleKey, canWrite }: { moduleKey: string; canWrite: boolean }) {
  const fetcher = useCallback(() => listCustomFields(moduleKey), [moduleKey]);
  const { data, loading, error, reload } = useAsyncData(fetcher);
  const [draft, setDraft] = useState<Draft>(null);

  const rows = data ?? [];

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: 'var(--sp-2)' }}>
          <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
            + Nuevo campo
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState label="Cargando campos…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Clave</th>
                <th>Tipo</th>
                <th>Requerido</th>
                <th className="panel-table-num">Orden</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>Sin campos para este módulo.</td>
                </tr>
              ) : (
                rows.map((f) => (
                  <tr
                    key={f.id}
                    onClick={canWrite ? () => setDraft(f) : undefined}
                    style={canWrite ? { cursor: 'pointer' } : undefined}
                  >
                    <td>
                      <strong>{f.label}</strong>
                    </td>
                    <td>
                      <code>{f.fieldKey}</code>
                    </td>
                    <td>{TYPE_LABEL[f.fieldType] ?? f.fieldType}</td>
                    <td>{f.required ? 'Sí' : 'No'}</td>
                    <td className="panel-table-num">{f.sort}</td>
                    <td>
                      {f.active ? <Badge tone="on">Activo</Badge> : <Badge tone="off">Inactivo</Badge>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {draft !== null && (
        <CustomFieldDrawer
          draft={draft}
          moduleKey={moduleKey}
          canWrite={canWrite}
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

function CustomFieldDrawer({
  draft,
  moduleKey,
  canWrite,
  onClose,
  onSaved,
}: {
  draft: Draft;
  moduleKey: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = draft === 'new';
  const existing = isNew || draft === null ? null : draft;
  const [label, setLabel] = useState(existing?.label ?? '');
  const [fieldKey, setFieldKey] = useState(existing?.fieldKey ?? '');
  const [fieldType, setFieldType] = useState<CustomFieldType>(existing?.fieldType ?? 'text');
  const [required, setRequired] = useState(existing?.required ?? false);
  const [optionsText, setOptionsText] = useState((existing?.options ?? []).join('\n'));
  const [sort, setSort] = useState<number | ''>(existing?.sort ?? 0);
  const [active, setActive] = useState(existing?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const labelError = label.trim() === '' ? 'La etiqueta es obligatoria.' : null;
  const keyError =
    isNew && !/^[a-z][a-z0-9_]*$/.test(fieldKey.trim())
      ? 'Clave en snake_case (minúsculas, números y _).'
      : null;
  const options = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);
  const optionsError =
    fieldType === 'select' && options.length === 0 ? 'Agrega al menos una opción.' : null;
  const canSubmit = canWrite && !labelError && !keyError && !optionsError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    try {
      if (isNew) {
        await createCustomField({
          moduleKey,
          fieldKey: fieldKey.trim(),
          label: label.trim(),
          fieldType,
          required,
          options: fieldType === 'select' ? options : [],
          sort: sort === '' ? 0 : sort,
          active,
        });
      } else {
        await updateCustomField(existing!.id, {
          label: label.trim(),
          fieldType,
          required,
          options: fieldType === 'select' ? options : [],
          sort: sort === '' ? 0 : sort,
          active,
        });
      }
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing || saving) return;
    if (!window.confirm(`¿Eliminar el campo "${existing.label}"?`)) return;
    setSaving(true);
    setServerError(null);
    try {
      await deleteCustomField(existing.id);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo eliminar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo campo' : 'Editar campo'}
      onClose={onClose}
      footer={
        <>
          {!isNew && canWrite && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              onClick={remove}
              style={{ marginRight: 'auto' }}
            >
              Eliminar
            </button>
          )}
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
      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0 }}>
        <TextField label="Etiqueta" name="label" value={label} onChange={setLabel} required error={labelError} />
        {isNew ? (
          <TextField
            label="Clave"
            name="fieldKey"
            value={fieldKey}
            onChange={setFieldKey}
            required
            error={keyError}
            hint="snake_case; no se puede cambiar después."
          />
        ) : (
          <div className="panel-field">
            <span className="panel-field-label">Clave</span>
            <p style={{ margin: 0 }}>
              <code>{fieldKey}</code>
            </p>
          </div>
        )}
        <SelectField
          label="Tipo"
          name="fieldType"
          value={fieldType}
          onChange={(v) => setFieldType(v as CustomFieldType)}
          options={TYPE_OPTIONS}
        />
        {fieldType === 'select' && (
          <div className="panel-field">
            <label className="panel-field-label" htmlFor="options">
              Opciones
            </label>
            <textarea
              id="options"
              name="options"
              className="panel-input"
              rows={4}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Una opción por línea"
            />
            {optionsError ? (
              <span className="panel-field-error" role="alert">
                {optionsError}
              </span>
            ) : (
              <span className="panel-field-hint">Una opción por línea.</span>
            )}
          </div>
        )}
        <NumberField label="Orden" name="sort" value={sort} onChange={setSort} step={1} />
        <CheckboxField label="Requerido" name="required" checked={required} onChange={setRequired} />
        <CheckboxField label="Activo" name="active" checked={active} onChange={setActive} />
      </fieldset>
    </Drawer>
  );
}
