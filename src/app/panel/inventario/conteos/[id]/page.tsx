'use client';

/**
 * Detalle / captura de conteo físico (F2 · Tanda B, módulo `inventario`).
 * Cabecera + tabla de partidas con la existencia del sistema, la cantidad
 * contada (editable) y la diferencia en vivo. Acciones: guardar captura (PATCH),
 * aplicar (genera ajustes solo por diferencias) y cancelar. Tras aplicar, el
 * conteo queda en solo lectura. La UI sólo oculta; el server es la autoridad.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CountItem } from '@/lib/types/erp-inventario';
import {
  getCount,
  updateCaptura,
  aplicarCount,
  cancelarCount,
  COUNT_STATUS_LABEL,
  countStatusTone,
  type CapturaItem,
} from '../../../_lib/conteos';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../../../_components/States';

const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

/** Diferencia en vivo a partir del borrador (null si el campo está vacío). */
function liveDiff(it: CountItem, raw: string): number | null {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.round(n) - it.systemQty;
}

const CARD: React.CSSProperties = { padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' };

export default function ConteoDetallePage({ params }: { params: { id: string } }) {
  const can = useCan();
  const { data: count, loading, error, reload } = useAsyncData(() => getCount(params.id));

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Siembra el borrador con lo guardado cada vez que llega el detalle del server.
  useEffect(() => {
    if (count) {
      setDraft(
        Object.fromEntries(
          count.items.map((it) => [
            it.productVariantId,
            it.countedQty == null ? '' : String(it.countedQty),
          ]),
        ),
      );
    }
  }, [count]);

  const adjustments = useMemo(
    () => (count?.items ?? []).filter((it) => it.diff != null && it.diff !== 0).length,
    [count],
  );
  const pending = useMemo(
    () => (count?.items ?? []).filter((it) => it.countedQty == null).length,
    [count],
  );

  if (loading && !count) return <Spinner label="Cargando conteo…" />;
  if (error && !count) return <ErrorState message={error} onRetry={reload} />;
  if (!count) return null;

  const editable = count.status === 'borrador' || count.status === 'en_conteo';
  const canEdit = can('inventario', 'editar');
  const canCancel = can('inventario', 'cancelar');
  const showCapture = editable && canEdit;

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'La acción no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCaptura() {
    const items: CapturaItem[] = count!.items
      .map((it) => ({ it, raw: draft[it.productVariantId] }))
      .filter(({ raw }) => raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)))
      .map(({ it, raw }) => ({
        productVariantId: it.productVariantId,
        countedQty: Math.max(0, Math.round(Number(raw))),
      }));
    if (items.length === 0) {
      setActionError('Captura la cantidad contada en al menos una partida.');
      return;
    }
    await runAction(() => updateCaptura(params.id, items));
  }

  async function apply() {
    const confirmed = window.confirm(
      `Se generarán ${adjustments} ajuste(s) por diferencias. ¿Aplicar el conteo? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    await runAction(() => aplicarCount(params.id));
  }

  async function cancel() {
    if (!window.confirm('¿Cancelar este conteo? No podrá aplicarse después.')) return;
    await runAction(() => cancelarCount(params.id));
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            Conteo {count.folio}{' '}
            <Badge tone={countStatusTone(count.status)}>{COUNT_STATUS_LABEL[count.status]}</Badge>
          </h2>
          <p className="panel-page-sub">{count.warehouseName ?? 'Almacén —'}</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario/conteos">
          Volver
        </Link>
      </div>

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      {/* Cabecera */}
      <div className="panel-card" style={CARD}>
        <div className="panel-form-grid">
          <Meta label="Almacén" value={count.warehouseName ?? '—'} />
          <Meta label="Fecha" value={fmtDate(count.createdAt)} />
          <Meta label="Partidas" value={String(count.itemCount)} />
          <Meta label="Pendientes de contar" value={String(pending)} />
          <Meta label="Diferencias" value={String(adjustments)} />
          <Meta label="Aplicado" value={fmtDate(count.appliedAt)} />
        </div>
        {count.notas && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0' }}>{count.notas}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="panel-card" style={CARD}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!editable && <ReadOnlyBadge />}
          {showCapture && (
            <button type="button" className="pbtn pbtn--primary" disabled={busy} onClick={saveCaptura}>
              {busy ? 'Guardando…' : 'Guardar captura'}
            </button>
          )}
          {editable && canEdit && (
            <button type="button" className="pbtn pbtn--primary" disabled={busy} onClick={apply}>
              Aplicar conteo ({adjustments} ajuste{adjustments === 1 ? '' : 's'})
            </button>
          )}
          {editable && canCancel && (
            <button type="button" className="pbtn pbtn--danger" disabled={busy} onClick={cancel}>
              Cancelar conteo
            </button>
          )}
          {!editable && (
            <span className="panel-field-hint">
              Conteo {COUNT_STATUS_LABEL[count.status].toLowerCase()}; sin acciones disponibles.
            </span>
          )}
        </div>
      </div>

      {/* Partidas */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Partidas
        </h3>
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="panel-table-num">Sistema</th>
                <th className="panel-table-num">Contado</th>
                <th className="panel-table-num">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {count.items.map((it) => {
                const raw = draft[it.productVariantId] ?? '';
                const d = showCapture ? liveDiff(it, raw) : it.diff;
                return (
                  <tr key={it.id}>
                    <td>{it.sku ?? '—'}</td>
                    <td>{it.name}</td>
                    <td className="panel-table-num">{it.systemQty}</td>
                    <td className="panel-table-num">
                      {showCapture ? (
                        <input
                          type="number"
                          className="panel-input"
                          min={0}
                          step={1}
                          value={raw}
                          aria-label={`Cantidad contada de ${it.name}`}
                          style={{ maxWidth: 110, textAlign: 'right' }}
                          onChange={(e) =>
                            setDraft((s) => ({ ...s, [it.productVariantId]: e.target.value }))
                          }
                        />
                      ) : (
                        (it.countedQty ?? '—')
                      )}
                    </td>
                    <td className="panel-table-num">
                      {d == null ? '—' : d > 0 ? `+${d}` : String(d)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-field">
      <span className="panel-field-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}
