'use client';

/**
 * Maestro de Productos. Tabla paginada + drawer con editor de variantes.
 * - tipo producto/servicio, clave SAT prod/serv, IVA.
 * - Variantes: SKU, nombre, precio, clave unidad (catálogo SAT c_ClaveUnidad).
 * - POST crea producto + variante(s) (contrato C3). Perms: maestros.crear/editar.
 */

import { useMemo, useState } from 'react';
import type { ProductRow, VariantRow } from '@/lib/types/erp';
import { listProducts, createProduct, updateProduct, getCatalogs } from '../_lib/api';
import { useAsyncData, usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Drawer } from '../_components/Drawer';
import { TextField, SelectField, type SelectOption } from '../_components/Field';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { isBlank } from '../_lib/validation';

const TIPO_OPTS: SelectOption[] = [
  { value: 'producto', label: 'Producto' },
  { value: 'servicio', label: 'Servicio' },
];
const IVA_OPTS: SelectOption[] = [
  { value: '0.16', label: '16%' },
  { value: '0.08', label: '8% (frontera)' },
  { value: '0', label: '0% / Exento' },
];

type Draft = 'new' | ProductRow | null;

interface VariantDraft {
  id: string;
  sku: string;
  name: string;
  basePriceMxn: number | '';
  claveUnidad: string;
}

export default function ProductosPage() {
  const can = useCan();
  const list = usePaginated<ProductRow>(listProducts);
  const catalogs = useAsyncData(getCatalogs);
  const [draft, setDraft] = useState<Draft>(null);

  const unidadOpts: SelectOption[] = useMemo(
    () => (catalogs.data?.claveUnidad ?? []).map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })),
    [catalogs.data],
  );

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: 'Producto',
      render: (r) => (
        <div>
          <strong>{r.name}</strong>
          {r.category && <div style={{ color: 'var(--ink-55)', fontSize: 'var(--fs-caption)' }}>{r.category}</div>}
        </div>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (r) => <Badge tone="blue">{r.tipo}</Badge> },
    { key: 'clave', header: 'Clave SAT', render: (r) => r.claveProdServ ?? '—' },
    { key: 'iva', header: 'IVA', numeric: true, render: (r) => `${Math.round(r.ivaRate * 100)}%` },
    {
      key: 'variants',
      header: 'Variantes',
      numeric: true,
      render: (r) => r.variants?.length ?? 0,
    },
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      render: (r) => {
        const total = (r.variants ?? []).reduce((s, v) => s + (v.stockTotal ?? 0), 0);
        return total || '—';
      },
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Productos</h2>
          <p className="panel-page-sub">Catálogo de productos y servicios con variantes.</p>
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
        onRowClick={(r) => setDraft(r)}
        searchPlaceholder="Buscar por nombre o SKU…"
        emptyTitle="Sin productos"
        emptyMessage="Aún no has registrado productos."
        toolbarActions={
          can('maestro_productos', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
              + Nuevo producto
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {draft !== null && (
        <ProductDrawer
          draft={draft}
          unidadOpts={unidadOpts}
          canEdit={draft === 'new' ? can('maestro_productos', 'crear') : can('maestro_productos', 'editar')}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function toVariantDraft(v: VariantRow): VariantDraft {
  return { id: v.id, sku: v.sku, name: v.name ?? '', basePriceMxn: v.basePriceMxn, claveUnidad: v.claveUnidad };
}

function emptyVariant(): VariantDraft {
  return { id: '', sku: '', name: '', basePriceMxn: '', claveUnidad: 'H87' };
}

function ProductDrawer({
  draft,
  unidadOpts,
  canEdit,
  onClose,
  onSaved,
}: {
  draft: Draft;
  unidadOpts: SelectOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = draft === 'new';
  const existing = isNew || draft === null ? null : draft;
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [tipo, setTipo] = useState<'producto' | 'servicio'>(existing?.tipo ?? 'producto');
  const [claveProdServ, setClaveProdServ] = useState(existing?.claveProdServ ?? '');
  const [ivaRate, setIvaRate] = useState(String(existing?.ivaRate ?? 0.16));
  const [variants, setVariants] = useState<VariantDraft[]>(
    existing && existing.variants.length ? existing.variants.map(toVariantDraft) : [emptyVariant()],
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addVariant = () => setVariants((vs) => [...vs, emptyVariant()]);
  const removeVariant = (i: number) => setVariants((vs) => (vs.length > 1 ? vs.filter((_, idx) => idx !== i) : vs));

  const nameError = isBlank(name) ? 'El nombre es obligatorio.' : null;
  const variantsValid = variants.every((v) => !isBlank(v.sku) && v.basePriceMxn !== '' && Number(v.basePriceMxn) >= 0);
  const canSubmit = canEdit && !nameError && variantsValid && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    const body: Partial<ProductRow> = {
      name: name.trim(),
      category: category.trim() || null,
      tipo,
      claveProdServ: claveProdServ.trim() || null,
      ivaRate: Number(ivaRate),
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        name: v.name.trim() || null,
        basePriceMxn: v.basePriceMxn === '' ? 0 : Number(v.basePriceMxn),
        claveUnidad: v.claveUnidad || 'H87',
        attributes: {},
        stockTotal: null,
      })),
    };
    try {
      if (isNew) await createProduct(body);
      else await updateProduct(existing!.id, body);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo producto' : 'Editar producto'}
      onClose={onClose}
      footer={
        <>
          {!canEdit && <ReadOnlyBadge />}
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
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <TextField label="Nombre" name="name" value={name} onChange={setName} required error={nameError} />
        <div className="panel-form-grid">
          <TextField label="Categoría" name="category" value={category} onChange={setCategory} />
          <SelectField
            label="Tipo"
            name="tipo"
            value={tipo}
            onChange={(v) => setTipo(v === 'servicio' ? 'servicio' : 'producto')}
            options={TIPO_OPTS}
            placeholder="Producto"
          />
        </div>
        <div className="panel-form-grid">
          <TextField
            label="Clave SAT (ProdServ)"
            name="claveProdServ"
            value={claveProdServ}
            onChange={setClaveProdServ}
            hint="c_ClaveProdServ"
          />
          <SelectField
            label="IVA"
            name="ivaRate"
            value={ivaRate}
            onChange={setIvaRate}
            options={IVA_OPTS}
            placeholder="16%"
          />
        </div>

        <div style={{ margin: 'var(--sp-2) 0 var(--sp-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="panel-field-label">Variantes</span>
          <button type="button" className="pbtn pbtn--ghost pbtn--sm" onClick={addVariant}>
            + Añadir variante
          </button>
        </div>
        {variants.map((v, i) => (
          <div
            key={i}
            className="panel-card"
            style={{ padding: 'var(--sp-2)', marginBottom: 'var(--sp-2)', boxShadow: 'none' }}
          >
            <div className="panel-form-grid">
              <TextField label="SKU" name={`sku-${i}`} value={v.sku} onChange={(val) => setVariant(i, { sku: val })} required />
              <TextField label="Nombre variante" name={`vname-${i}`} value={v.name} onChange={(val) => setVariant(i, { name: val })} />
            </div>
            <div className="panel-form-grid">
              <div className="panel-field">
                <label className="panel-field-label" htmlFor={`price-${i}`}>
                  Precio base (MXN)<span className="panel-field-req">*</span>
                </label>
                <input
                  id={`price-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  className="panel-input"
                  value={v.basePriceMxn}
                  onChange={(e) => setVariant(i, { basePriceMxn: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </div>
              <SelectField
                label="Clave unidad"
                name={`unidad-${i}`}
                value={v.claveUnidad}
                onChange={(val) => setVariant(i, { claveUnidad: val })}
                options={unidadOpts}
                placeholder="H87 · Pieza"
              />
            </div>
            {variants.length > 1 && (
              <button type="button" className="pbtn pbtn--danger pbtn--sm" onClick={() => removeVariant(i)}>
                Quitar variante
              </button>
            )}
          </div>
        ))}
        {!variantsValid && (
          <p className="panel-field-hint">Cada variante necesita SKU y precio (≥ 0).</p>
        )}
      </fieldset>
    </Drawer>
  );
}
