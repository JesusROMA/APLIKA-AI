'use client';

/**
 * Campos de formulario accesibles (label + control + error/hint). Todos usan
 * los tokens del brand kit. `id` se deriva del `name` para asociar label/input.
 */

import { useId } from 'react';

interface BaseProps {
  label: string;
  name: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
}

function Wrap({
  id,
  label,
  required,
  error,
  hint,
  children,
}: BaseProps & { id: string; children: React.ReactNode }) {
  return (
    <div className="panel-field">
      <label className="panel-field-label" htmlFor={id}>
        {label}
        {required && <span className="panel-field-req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <span className="panel-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="panel-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  value,
  onChange,
  required,
  error,
  hint,
  type = 'text',
  placeholder,
  inputMode,
  autoComplete,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} name={name} required={required} error={error} hint={hint}>
      <input
        id={id}
        name={name}
        type={type}
        className="panel-input"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrap>
  );
}

export function NumberField({
  label,
  name,
  value,
  onChange,
  required,
  error,
  hint,
  min,
  step,
}: BaseProps & {
  value: number | '';
  onChange: (v: number | '') => void;
  min?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} name={name} required={required} error={error} hint={hint}>
      <input
        id={id}
        name={name}
        type="number"
        className="panel-input"
        value={value}
        min={min}
        step={step}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </Wrap>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  required,
  error,
  hint,
  placeholder = 'Selecciona…',
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} name={name} required={required} error={error} hint={hint}>
      <select
        id={id}
        name={name}
        className="panel-select"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function CheckboxField({
  label,
  name,
  checked,
  onChange,
  hint,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="panel-field">
      <label className="panel-checkbox" htmlFor={id}>
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <span className="panel-field-hint">{hint}</span>}
    </div>
  );
}
