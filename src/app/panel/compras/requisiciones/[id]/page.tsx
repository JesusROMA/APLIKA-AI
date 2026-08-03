'use client';

/**
 * Detalle de requisición (F6 · Tanda B, módulo `compras`). Cabecera (folio,
 * estado, fecha) + tabla de partidas (Cantidad / Costo estimado / Importe).
 * Acciones según estado y permisos:
 *  - Aprobar / Rechazar (borrador → aprobada/rechazada; aprobada → rechazada).
 *  - Convertir a OC (aprobada): elige proveedor, crea la Orden de Compra y
 *    navega a su detalle.
 * Si ya está 'convertida', muestra el enlace a la OC generada. La UI sólo oculta;
 * el server (RLS + RPC) es la autoridad.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getRequisition,
  aprobarRequisition,
  rechazarRequisition,
  convertirRequisition,
  listSuppliers,
  REQ_STATUS_LABEL,
  reqStatusTone,
} from '../../../_lib/requisiciones';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../../../_components/States';
import { Drawer } from '../../../_components/Drawer';
import { SelectField, type SelectOption } from '../../../_components/Field';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

const CARD: React.CSSProperties = { padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' };

export default function RequisicionDetallePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const can = useCan();
  const { data: reqData, loading, error, reload } = useAsyncData(() =>
    getRequisition(params.id),
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');

  const suppliers = useAsyncData(() => listSuppliers({ pageSize: 100, status: 'activo' }));
  const supplierOpts: SelectOption[] = useMemo(
    () => (suppliers.data?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data],
  );

  const estimatedTotal = useMemo(
    () =>
      (reqData?.items ?? []).reduce((s, it) => s + it.qty * it.estimatedCost, 0),
    [reqData?.items],
  );

  if (loading && !reqData) return <Spinner label="Cargando requisición…" />;
  if (error && !reqData) return <ErrorState message={error} onRetry={reload} />;
  if (!reqData) return null;

  const canEdit = can('compras', 'editar');
  const canCreate = can('compras', 'crear');

  const showAprobar = reqData.status === 'borrador' && canEdit;
  const showRechazar =
    (reqData.status === 'borrador' || reqData.status === 'aprobada') && canEdit;
  const showConvertir = reqData.status === 'aprobada' && canCreate;
  const noActions = !showAprobar && !showRechazar && !showConvertir;

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

  async function submitConvert() {
    if (!supplierId) return;
    setBusy(true);
    setActionError(null);
    try {
      const { purchaseOrderId } = await convertirRequisition(params.id, supplierId);
      setConvertOpen(false);
      router.push(`/panel/compras/${purchaseOrderId}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo convertir la requisición.');
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            REQ {reqData.folio}{' '}
            <Badge tone={reqStatusTone(reqData.status)}>{REQ_STATUS_LABEL[reqData.status]}</Badge>
          </h2>
          <p className="panel-page-sub">Solicitud interna de compra</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras/requisiciones">
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
          <Meta label="Folio" value={reqData.folio} />
          <Meta label="Estado" value={REQ_STATUS_LABEL[reqData.status]} />
          <Meta label="Partidas" value={String(reqData.itemCount)} />
          <Meta label="Creada" value={fmtDate(reqData.createdAt)} />
          <Meta label="Total estimado" value={MXN.format(estimatedTotal)} />
        </div>
        {reqData.notas && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reqData.notas}</p>
          </div>
        )}
        {reqData.status === 'convertida' && reqData.purchaseOrderId && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <Link className="pbtn pbtn--ghost" href={`/panel/compras/${reqData.purchaseOrderId}`}>
              Ver orden de compra generada →
            </Link>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Acciones
        </h3>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!canEdit && !canCreate && <ReadOnlyBadge />}
          {showAprobar && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => runAction(() => aprobarRequisition(params.id))}
            >
              Aprobar
            </button>
          )}
          {showConvertir && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => setConvertOpen(true)}
            >
              Convertir a orden de compra
            </button>
          )}
          {showRechazar && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              disabled={busy}
              onClick={() => runAction(() => rechazarRequisition(params.id))}
            >
              Rechazar
            </button>
          )}
          {noActions && (
            <span className="panel-field-hint">Sin acciones disponibles para este estado.</span>
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
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Costo estimado</th>
                <th className="panel-table-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {reqData.items.map((it) => (
                <tr key={it.id ?? `${it.sku}-${it.name}`}>
                  <td>{it.sku ?? '—'}</td>
                  <td>{it.name}</td>
                  <td className="panel-table-num">{it.qty}</td>
                  <td className="panel-table-num">{MXN.format(it.estimatedCost)}</td>
                  <td className="panel-table-num">{MXN.format(it.qty * it.estimatedCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="panel-table-num">
                  <strong>Total estimado</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(estimatedTotal)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Drawer
        open={convertOpen}
        title="Convertir a orden de compra"
        onClose={() => setConvertOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="pbtn pbtn--ghost"
              onClick={() => setConvertOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={submitConvert}
              disabled={busy || !supplierId}
            >
              {busy ? 'Convirtiendo…' : 'Crear orden de compra'}
            </button>
          </div>
        }
      >
        <p className="panel-field-hint" style={{ marginTop: 0 }}>
          Se creará una orden de compra en borrador para el proveedor elegido, usando el costo
          estimado de cada partida como costo unitario (IVA 16%).
        </p>
        <SelectField
          label="Proveedor"
          name="supplierId"
          value={supplierId}
          onChange={setSupplierId}
          options={supplierOpts}
          placeholder="Selecciona proveedor…"
          required
        />
      </Drawer>
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
