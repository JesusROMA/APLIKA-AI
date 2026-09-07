'use client';

/**
 * Maestro de Almacenes. Tabla paginada + drawer (nombre, código, default).
 * Perms: maestros.crear / maestros.editar.
 */

import { useState } from 'react';
import type { WarehouseRow } from '@/lib/types/erp';
import { listWarehouses, createWarehouse, updateWarehouse } from '../_lib/api';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Drawer } from '../_components/Drawer';
import { TextField, CheckboxField } from '../_components/Field';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { isBlank } from '../_lib/validation';

type Draft = 'new' | WarehouseRow | null;

export default function AlmacenesPage() {
  const can = useCan();
  const list = usePaginated<WarehouseRow>(listWarehouses);
  const [draft, setDraft] = useState<Draft>(null);

  const columns: Column<WarehouseRow>[] = [
    { key: 'name', header: 'Nombre', render: (r) => <strong>{r.name}</strong> },
    { key: 'code', header: 'Código', render: (r) => r.code ?? '—' },
    {
      key: 'default',
      header: 'Predeterminado',
      render: (r) => (r.isDefault ? <Badge tone="on">Sí</Badge> : <Badge tone="off">No</Badge>),
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Almacenes</h2>
          <p className="panel-page-sub">Ubicaciones de inventario.</p>
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
        searchPlaceholder="Buscar almacén…"
        emptyTitle="Sin almacenes"
        emptyMessage="Aún no has registrado almacenes."
        toolbarActions={
          can('maestro_almacenes', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
              + Nuevo almacén
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {draft !== null && (
        <WarehouseDrawer
          draft={draft}
          canEdit={draft === 'new' ? can('maestro_almacenes', 'crear') : can('maestro_almacenes', 'editar')}
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

function WarehouseDrawer({
  draft,
  canEdit,
  onClose,
  onSaved,
}: {
  draft: Draft;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = draft === 'new';
  const existing = isNew || draft === null ? null : draft;
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = isBlank(name) ? 'El nombre es obligatorio.' : null;
  const canSubmit = canEdit && !nameError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    const body: Partial<WarehouseRow> = {
      name: name.trim(),
      code: code.trim() || null,
      isDefault,
    };
    try {
      if (isNew) await createWarehouse(body);
      else await updateWarehouse(existing!.id, body);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo almacén' : 'Editar almacén'}
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
        <TextField label="Código" name="code" value={code} onChange={setCode} hint="Opcional." />
        <CheckboxField
          label="Almacén predeterminado"
          name="isDefault"
          checked={isDefault}
          onChange={setIsDefault}
          hint="El almacén por defecto para nuevos movimientos."
        />
      </fieldset>
    </Drawer>
  );
}
