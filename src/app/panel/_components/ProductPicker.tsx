'use client';

/**
 * ProductPicker — buscador de variante para AGREGAR una partida (compartido F1).
 * Al enfocar (o con el botón ▾) muestra el catálogo de inmediato (primeros 20
 * por SKU, sin escribir); al teclear filtra con debounce ~300ms. El precio ya
 * viene resuelto para el cliente/lista. Al elegir, llama onPick(variant) y
 * limpia el input.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { VariantPick } from '@/lib/types/erp-ventas';
import { searchVariants } from '../_lib/ventas-api';

interface Props {
  customerId?: string | null;
  /** F8: lista de precios seleccionada en el documento (manda sobre la del cliente). */
  priceListId?: string | null;
  /** F8: almacén del documento — el stock mostrado es el de ese almacén. */
  warehouseId?: string | null;
  onPick: (v: VariantPick) => void;
  disabled?: boolean;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function ProductPicker({ customerId, priceListId, warehouseId, onPick, disabled = false }: Props) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<VariantPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Búsqueda con debounce; con el término vacío trae el catálogo de inmediato
  // (el endpoint sin `search` regresa los primeros 20 por SKU).
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    let alive = true;
    setLoading(true);
    const run = () =>
      searchVariants(q, customerId, { priceListId, warehouseId })
        .then((rows) => {
          if (alive) setResults(rows.slice(0, 20));
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    const t = setTimeout(run, q ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, open, customerId, priceListId, warehouseId]);

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

  function pick(v: VariantPick) {
    onPick(v);
    setTerm('');
    setResults([]);
    setActive(-1);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && active < results.length) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="f1-picker" ref={rootRef}>
      <div className="f1-picker-box">
        <input
          id={listId}
          type="text"
          className="panel-input"
          placeholder="Agregar producto: busca por SKU o nombre…"
          value={term}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
          aria-label="Agregar producto"
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="f1-picker-toggle"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Cerrar catálogo' : 'Ver catálogo de productos'}
          title={open ? 'Cerrar catálogo' : 'Ver catálogo de productos'}
          onMouseDown={(e) => {
            // mousedown (no click) para ganarle al blur del input.
            e.preventDefault();
            setOpen((o) => !o);
            setActive(-1);
          }}
        >
          ▾
        </button>

        {open && (
          <ul className="f1-picker-menu" id={`${listId}-list`} role="listbox" aria-label="Productos">
            {results.length === 0 ? (
              <li className="f1-picker-empty" role="presentation">
                {loading ? 'Buscando…' : term.trim() ? 'Sin resultados' : 'Sin productos en el catálogo'}
              </li>
            ) : (
              <>
                {!term.trim() && (
                  <li className="f1-picker-hint" role="presentation">
                    Catálogo (primeros {results.length} por SKU) — escribe para filtrar
                  </li>
                )}
                {results.map((v, i) => {
                const id = `${listId}-opt-${i}`;
                const isActive = i === active;
                return (
                  <li
                    key={v.id}
                    id={id}
                    role="option"
                    aria-selected={isActive}
                    className={`f1-picker-option${isActive ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(v);
                    }}
                  >
                    <span className="f1-picker-option-main">
                      <span className="f1-picker-sku">{v.sku}</span>
                      <span className="f1-picker-dot"> · </span>
                      {v.name}
                    </span>
                    <span className="f1-picker-option-side">
                      {MXN.format(v.price)}
                      <span className="f1-picker-stock">
                        {' · '}
                        {v.stockTotal == null ? 'Stock n/d' : `${v.stockTotal} disp.`}
                      </span>
                    </span>
                  </li>
                  );
                })}
              </>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
