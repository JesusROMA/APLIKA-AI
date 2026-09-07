'use client';

/**
 * Maestro de Listas de precios. Tabla paginada + creación de lista (nombre,
 * default) + editor de items (variante → precio) que hace PUT masivo a
 * /api/erp/price-lists/[id]/items (reemplazo/upsert). Perms: maestros.*.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PriceListRow, PriceListItemRow } from '@/lib/types/erp';
import {
  listPriceLists,
  createPriceList,
  getPriceListItems,
  putPriceListItems,
  listProducts,
} from '../_lib/api';
import { useAsyncData, usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Drawer } from '../_components/Drawer';
import { TextField, CheckboxField } from '../_components/Field';
import { Badge, ReadOnlyBadge, LoadingState, ErrorState } from '../_components/States';
import { isBlank } from '../_lib/validation';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export default function ListasPreciosPage() {
  const can = useCan();
  const list = usePaginated<PriceListRow>(listPriceLists);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PriceListRow | null>(null);

  const columns: Column<PriceListRow>[] = [
    { key: 'name', header: 'Nombre', render: (r) => <strong>{r.name}</strong> },
    {
      key: 'default',
      header: 'Predeterminada',
      render: (r) => (r.isDefault ? <Badge tone="on">Sí</Badge> : <Badge tone="off">No</Badge>),
    },
    { key: 'items', header: 'Items', numeric: true, render: (r) => r.itemCount },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Listas de precios</h2>
          <p className="panel-page-sub">Precios por lista; el pedido usa la lista del cliente o el precio base.</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.data ?? []}
        rowKey={(r) => r.id}
        page={list.page}
        pageSize={list.pageSize}
        total={list.data?.total ?? 0}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        search={list.search}
        onSearchChange={list.setSearch}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => setEditing(r)}
        searchPlaceholder="Buscar lista…"
        emptyTitle="Sin listas de precios"
        emptyMessage="Crea una lista para asignar precios por cliente."
        toolbarActions={
          can('maestro_precios', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setCreating(true)}>
              + Nueva lista
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {creating && (
        <CreateListDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}

      {editing && (
        <ItemsDrawer
          list={editing}
          canEdit={can('maestro_precios', 'editar')}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function CreateListDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = isBlank(name) ? 'El nombre es obligatorio.' : null;
  const canSubmit = !nameError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    try {
      await createPriceList({ name: name.trim(), isDefault });
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo crear.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title="Nueva lista de precios"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </>
      }
    >
      {serverError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {serverError}
        </p>
      )}
      <TextField label="Nombre" name="name" value={name} onChange={setName} required error={nameError} />
      <CheckboxField
        label="Lista predeterminada"
        name="isDefault"
        checked={isDefault}
        onChange={setIsDefault}
      />
    </Drawer>
  );
}

interface EditableItem {
  productVariantId: string;
  sku: string;
  productName: string;
  priceMxn: number | '';
}

function ItemsDrawer({
  list,
  canEdit,
  onClose,
  onSaved,
}: {
  list: PriceListRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const items = useAsyncData(() => getPriceListItems(list.id));
  const products = useAsyncData(() => listProducts({ pageSize: 100 }));
  const [rows, setRows] = useState<EditableItem[] | null>(null);
  const [addVariant, setAddVariant] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Semilla del editor a partir de los items existentes.
  useEffect(() => {
    if (items.data && rows === null) {
      setRows(
        items.data.map((it: PriceListItemRow) => ({
          productVariantId: it.productVariantId,
          sku: it.sku,
          productName: it.productName,
          priceMxn: it.priceMxn,
        })),
      );
    }
  }, [items.data, rows]);

  // Catálogo de variantes disponibles (para agregar a la lista).
  const allVariants = useMemo(() => {
    const out: { productVariantId: string; sku: string; productName: string }[] = [];
    for (const p of products.data?.data ?? []) {
      for (const v of p.variants ?? []) {
        out.push({ productVariantId: v.id, sku: v.sku, productName: p.name });
      }
    }
    return out;
  }, [products.data]);

  const availableToAdd = useMemo(() => {
    const present = new Set((rows ?? []).map((r) => r.productVariantId));
    return allVariants.filter((v) => !present.has(v.productVariantId));
  }, [allVariants, rows]);

  const setPrice = (id: string, price: number | '') =>
    setRows((rs) => (rs ?? []).map((r) => (r.productVariantId === id ? { ...r, priceMxn: price } : r)));
  const removeRow = (id: string) => setRows((rs) => (rs ?? []).filter((r) => r.productVariantId !== id));
  const addRow = () => {
    if (!addVariant) return;
    const v = allVariants.find((x) => x.productVariantId === addVariant);
    if (!v) return;
    setRows((rs) => [...(rs ?? []), { ...v, priceMxn: '' }]);
    setAddVariant('');
  };

  const valid = (rows ?? []).every((r) => r.priceMxn !== '' && Number(r.priceMxn) >= 0);
  const canSubmit = canEdit && valid && !saving && rows !== null;

  const submit = async () => {
    if (!canSubmit || rows === null) return;
    setSaving(true);
    setServerError(null);
    try {
      await putPriceListItems(
        list.id,
        rows.map((r) => ({ productVariantId: r.productVariantId, priceMxn: r.priceMxn === '' ? 0 : Number(r.priceMxn) })),
      );
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={`Precios · ${list.name}`}
      onClose={onClose}
      footer={
        <>
          {!canEdit && <ReadOnlyBadge />}
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
            {saving ? 'Guardando…' : 'Guardar precios'}
          </button>
        </>
      }
    >
      {serverError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {serverError}
        </p>
      )}

      {items.loading || rows === null ? (
        <LoadingState label="Cargando precios…" />
      ) : items.error ? (
        <ErrorState message={items.error} onRetry={items.reload} />
      ) : (
        <>
          {canEdit && (
            <div className="panel-toolbar" style={{ alignItems: 'flex-end' }}>
              <div className="panel-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="panel-field-label" htmlFor="add-variant">
                  Agregar variante
                </label>
                <select
                  id="add-variant"
                  className="panel-select"
                  value={addVariant}
                  onChange={(e) => setAddVariant(e.target.value)}
                >
                  <option value="">
                    {products.loading ? 'Cargando catálogo…' : 'Selecciona una variante…'}
                  </option>
                  {availableToAdd.map((v) => (
                    <option key={v.productVariantId} value={v.productVariantId}>
                      {v.sku} · {v.productName}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="pbtn pbtn--ghost" onClick={addRow} disabled={!addVariant}>
                Añadir
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="panel-field-hint" style={{ padding: 'var(--sp-3) 0' }}>
              Esta lista no tiene precios. Agrega variantes arriba.
            </p>
          ) : (
            <div className="panel-table-wrap" style={{ boxShadow: 'none', marginTop: 'var(--sp-1)' }}>
              <table className="panel-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th className="panel-table-num">Precio (MXN)</th>
                    {canEdit && <th aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.productVariantId}>
                      <td>{r.sku}</td>
                      <td>{r.productName}</td>
                      <td className="panel-table-num">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="panel-input"
                            style={{ width: 120, textAlign: 'right' }}
                            value={r.priceMxn}
                            aria-label={`Precio de ${r.sku}`}
                            onChange={(e) =>
                              setPrice(r.productVariantId, e.target.value === '' ? '' : Number(e.target.value))
                            }
                          />
                        ) : (
                          MXN.format(Number(r.priceMxn) || 0)
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            type="button"
                            className="pbtn pbtn--danger pbtn--sm"
                            onClick={() => removeRow(r.productVariantId)}
                          >
                            Quitar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!valid && <p className="panel-field-hint">Cada precio debe ser un número ≥ 0.</p>}
        </>
      )}
    </Drawer>
  );
}
