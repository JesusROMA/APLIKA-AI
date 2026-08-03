'use client';

/**
 * <CustomFields> — renderiza inputs a partir de `custom_field_defs` (F4) sobre un
 * objeto `custom` (jsonb del recurso). Pieza compartida del orquestador; la
 * cablea el form de clientes (customers.custom) y puede reutilizarse en otros
 * maestros/documentos. Solo campos activos, ordenados por `sort`.
 */

import type { CustomFieldDef } from '@/lib/types/erp-config';
import { TextField, NumberField, SelectField, CheckboxField } from './Field';

export function CustomFields({
  defs,
  value,
  onChange,
  readOnly = false,
}: {
  defs: CustomFieldDef[];
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const active = defs.filter((d) => d.active).sort((a, b) => a.sort - b.sort);
  if (active.length === 0) return null;

  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
      {active.map((d) => {
        const v = value[d.fieldKey];
        switch (d.fieldType) {
          case 'number':
            return (
              <NumberField
                key={d.id}
                label={d.label}
                name={d.fieldKey}
                required={d.required}
                value={typeof v === 'number' ? v : ''}
                onChange={(nv) => set(d.fieldKey, nv === '' ? null : nv)}
              />
            );
          case 'boolean':
            return (
              <CheckboxField
                key={d.id}
                label={d.label}
                name={d.fieldKey}
                checked={Boolean(v)}
                onChange={(nv) => set(d.fieldKey, nv)}
              />
            );
          case 'select':
            return (
              <SelectField
                key={d.id}
                label={d.label}
                name={d.fieldKey}
                required={d.required}
                value={typeof v === 'string' ? v : ''}
                onChange={(nv) => set(d.fieldKey, nv)}
                options={d.options.map((o) => ({ value: o, label: o }))}
              />
            );
          case 'date':
            return (
              <TextField
                key={d.id}
                label={d.label}
                name={d.fieldKey}
                type="date"
                required={d.required}
                value={typeof v === 'string' ? v : ''}
                onChange={(nv) => set(d.fieldKey, nv)}
              />
            );
          default: // 'text'
            return (
              <TextField
                key={d.id}
                label={d.label}
                name={d.fieldKey}
                required={d.required}
                value={typeof v === 'string' ? v : ''}
                onChange={(nv) => set(d.fieldKey, nv)}
              />
            );
        }
      })}
    </fieldset>
  );
}
