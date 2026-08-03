'use client';

/**
 * Drawer de recepción de una OC (F5 · Tanda B, módulo `compras`). Captura la
 * cantidad a recibir por partida (≤ pendiente) y llama a `recibir`. Recibir SUMA
 * al inventario con el costo de la OC y afecta el costo promedio (F2), por eso
 * el aviso. Sólo se listan partidas con pendiente > 0.
 */

import { useMemo, useState } from 'react';
import type { POLine, ReceiveLineInput } from '@/lib/types/erp-compras';
import { Drawer } from '../../_components/Drawer';

interface Props {
  open: boolean;
  items: POLine[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (lines: ReceiveLineInput[]) => void;
}

function pendingOf(it: POLine): number {
  return Math.max(0, Number(it.qty) - Number(it.qtyReceived ?? 0));
}

export function ReceiveDrawer({ open, items, busy = false, onClose, onSubmit }: Props) {
  // Partidas con pendiente por recibir.
  const receivable = useMemo(() => items.filter((it) => pendingOf(it) > 0), [items]);

  // qty capturada por itemId (arranca en el pendiente completo).
  const [qtys, setQtys] = useState<Record<string, number>>({});

  // Inicializa/resetea cuando cambia el set de partidas o se abre el drawer.
  const initKey = receivable.map((it) => `${it.id}:${pendingOf(it)}`).join('|');
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (open && seenKey !== initKey) {
    const init: Record<string, number> = {};
    for (const it of receivable) if (it.id) init[it.id] = pendingOf(it);
    setQtys(init);
    setSeenKey(initKey);
  }
  if (!open && seenKey !== null) setSeenKey(null);

  function setQty(itemId: string, raw: string, max: number) {
    const n = Number(raw);
    const clamped = Number.isFinite(n) ? Math.min(Math.max(0, n), max) : 0;
    setQtys((prev) => ({ ...prev, [itemId]: clamped }));
  }

  const lines: ReceiveLineInput[] = receivable
    .filter((it) => it.id && (qtys[it.id] ?? 0) > 0)
    .map((it) => ({ itemId: it.id as string, qty: qtys[it.id as string] }));

  const canSubmit = lines.length > 0 && !busy;

  return (
    <Drawer
      open={open}
      title="Recibir mercancía"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="pbtn pbtn--primary"
            disabled={!canSubmit}
            onClick={() => onSubmit(lines)}
          >
            {busy ? 'Recibiendo…' : 'Confirmar recepción'}
          </button>
        </div>
      }
    >
      <p className="panel-field-hint" style={{ marginTop: 0 }}>
        Recibir <strong>suma al inventario con el costo de la OC</strong> y afecta el costo
        promedio del producto. Captura la cantidad a recibir por partida (no puede superar lo
        pendiente).
      </p>

      {receivable.length === 0 ? (
        <p className="panel-field-hint">No hay partidas pendientes por recibir.</p>
      ) : (
        <div className="panel-table-wrap" style={{ marginTop: 'var(--sp-2)' }}>
          <table className="panel-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="panel-table-num">Pendiente</th>
                <th className="panel-table-num">Recibir</th>
              </tr>
            </thead>
            <tbody>
              {receivable.map((it) => {
                const max = pendingOf(it);
                const id = it.id as string;
                return (
                  <tr key={id}>
                    <td>{it.name}</td>
                    <td className="panel-table-num">{max}</td>
                    <td className="panel-table-num">
                      <input
                        type="number"
                        className="panel-input f1-num"
                        min={0}
                        max={max}
                        step="any"
                        value={qtys[id] ?? 0}
                        aria-label={`Cantidad a recibir de ${it.name}`}
                        disabled={busy}
                        onChange={(e) => setQty(id, e.target.value, max)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
