'use client';

/**
 * CustomerPicker — buscador de cliente con dropdown (pieza compartida F1).
 * Genérico para cotización/pedido/remisión/factura. La UI oculta; el server
 * es la autoridad. Debounce ~300ms sobre listCustomers.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { CustomerRow } from '@/lib/types/erp';
import { listCustomers, getCustomer } from '../_lib/api';

interface Props {
  value: string | null;
  onChange: (id: string | null, row?: CustomerRow) => void;
  allowPublico?: boolean;
  disabled?: boolean;
  label?: string;
}

/** Ítems del dropdown: "Público en general" (opcional) + clientes encontrados. */
type Item = { kind: 'publico' } | { kind: 'customer'; row: CustomerRow };

export function CustomerPicker({
  value,
  onChange,
  allowPublico = false,
  disabled = false,
  label = 'Cliente',
}: Props) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CustomerRow | null>(null);
  const [publico, setPublico] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Resuelve el nombre cuando el valor llega desde fuera (edición de documento).
  useEffect(() => {
    if (!value) return;
    if (selectedRow && selectedRow.id === value) return;
    let alive = true;
    getCustomer(value)
      .then((r) => {
        if (alive) {
          setSelectedRow(r);
          setPublico(false);
        }
      })
      .catch(() => {
        /* si falla, se muestra el placeholder sin nombre */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Búsqueda con debounce mientras el picker está abierto.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      let alive = true;
      listCustomers({ search: q, pageSize: 8 })
        .then((res) => {
          if (alive) setResults(res.data.slice(0, 8));
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, 300);
    return () => clearTimeout(t);
  }, [term, open]);

  // Cierra el dropdown al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const items: Item[] = [];
  if (allowPublico) items.push({ kind: 'publico' });
  for (const r of results) items.push({ kind: 'customer', row: r });

  function pickCustomer(row: CustomerRow) {
    setSelectedRow(row);
    setPublico(false);
    setEditing(false);
    setOpen(false);
    setTerm('');
    setResults([]);
    setActive(-1);
    onChange(row.id, row);
  }

  function pickPublico() {
    setSelectedRow(null);
    setPublico(true);
    setEditing(false);
    setOpen(false);
    setTerm('');
    setResults([]);
    setActive(-1);
    onChange(null);
  }

  function choose(item: Item) {
    if (item.kind === 'publico') pickPublico();
    else pickCustomer(item.row);
  }

  function startEditing() {
    setEditing(true);
    setOpen(true);
    setActive(-1);
    // enfoca en el siguiente frame, cuando el input ya está montado
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && active < items.length) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const showChip = (Boolean(value) || publico) && !editing;

  return (
    <div className="panel-field f1-picker" ref={rootRef}>
      <label className="panel-field-label" htmlFor={showChip ? undefined : listId}>
        {label}
      </label>

      {showChip ? (
        <div className="f1-picker-chip">
          <span className="f1-picker-chip-name">
            {publico ? 'Público en general' : selectedRow?.name ?? 'Cliente seleccionado'}
          </span>
          {!publico && selectedRow?.rfc && (
            <span className="f1-picker-chip-sub">{selectedRow.rfc}</span>
          )}
          {!disabled && (
            <button type="button" className="pbtn pbtn--ghost pbtn--sm" onClick={startEditing}>
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div className="f1-picker-box">
          <input
            id={listId}
            ref={inputRef}
            type="text"
            className="panel-input"
            placeholder="Busca por nombre o RFC…"
            value={term}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 ? `${listId}-opt-${active}` : undefined
            }
            autoComplete="off"
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />

          {open && (
            <ul className="f1-picker-menu" id={`${listId}-list`} role="listbox" aria-label={label}>
              {items.length === 0 ? (
                <li className="f1-picker-empty" role="presentation">
                  {loading
                    ? 'Buscando…'
                    : term.trim()
                      ? 'Sin resultados'
                      : 'Escribe para buscar…'}
                </li>
              ) : (
                items.map((item, i) => {
                  const id = `${listId}-opt-${i}`;
                  const isActive = i === active;
                  if (item.kind === 'publico') {
                    return (
                      <li
                        key="publico"
                        id={id}
                        role="option"
                        aria-selected={isActive}
                        className={`f1-picker-option f1-picker-option--publico${isActive ? ' is-active' : ''}`}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickPublico();
                        }}
                      >
                        <span className="f1-picker-option-main">Público en general</span>
                        <span className="f1-picker-option-side">Mostrador</span>
                      </li>
                    );
                  }
                  const r = item.row;
                  return (
                    <li
                      key={r.id}
                      id={id}
                      role="option"
                      aria-selected={isActive}
                      className={`f1-picker-option${isActive ? ' is-active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickCustomer(r);
                      }}
                    >
                      <span className="f1-picker-option-main">{r.name}</span>
                      <span className="f1-picker-option-side">{r.rfc ?? 'Sin RFC'}</span>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
