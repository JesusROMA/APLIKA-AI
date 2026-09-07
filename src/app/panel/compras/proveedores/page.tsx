'use client';

/**
 * Maestro de Proveedores (F5 · Compras). Espejo del maestro de Clientes.
 * Tabla paginada + drawer de alta/edición.
 * - Saldo de CxP (lo que les debemos) resaltado con Badge si > 0.
 * - Botón "Nuevo" y guardado gated por perms (compras.crear / compras.editar).
 */

import Link from 'next/link';
import { useState } from 'react';
import type { SupplierRow, SupplierInput } from '@/lib/types/erp-compras';
import { listSuppliers, createSupplier, updateSupplier } from '../../_lib/proveedores';
import { usePaginated } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DataTable, type Column } from '../../_components/DataTable';
import { Drawer } from '../../_components/Drawer';
import { TextField, NumberField, CheckboxField } from '../../_components/Field';
import { Badge, ReadOnlyBadge } from '../../_components/States';
import { validateRfc, isBlank } from '../../_lib/validation';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

type Draft = 'new' | SupplierRow | null;

export default function ProveedoresPage() {
  const can = useCan();
  const list = usePaginated<SupplierRow>(listSuppliers);
  const [draft, setDraft] = useState<Draft>(null);

  const columns: Column<SupplierRow>[] = [
    { key: 'name', header: 'Nombre', render: (r) => <strong>{r.name}</strong> },
    { key: 'rfc', header: 'RFC', render: (r) => r.rfc ?? '—' },
    {
      key: 'contact',
      header: 'Contacto',
      render: (r) => r.contactName ?? r.phone ?? r.email ?? '—',
    },
    {
      key: 'paymentDays',
      header: 'Días crédito',
      numeric: true,
      render: (r) => (r.paymentDays > 0 ? `${r.paymentDays}d` : '—'),
    },
    {
      key: 'balance',
      header: 'Saldo CxP',
      numeric: true,
      render: (r) =>
        r.balance > 0 ? <Badge tone="blue">{MXN.format(r.balance)}</Badge> : MXN.format(0),
    },
    {
      key: 'active',
      header: 'Estado',
      render: (r) => <Badge tone={r.active ? 'on' : 'off'}>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Proveedores</h2>
          <p className="panel-page-sub">Directorio de proveedores y saldos por pagar (CxP).</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras">
          Volver a compras
        </Link>
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
        searchPlaceholder="Buscar por nombre o RFC…"
        emptyTitle="Sin proveedores"
        emptyMessage="Aún no has registrado proveedores."
        toolbarActions={
          can('maestro_proveedores', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
              + Nuevo proveedor
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {draft !== null && (
        <SupplierDrawer
          draft={draft}
          canEdit={draft === 'new' ? can('maestro_proveedores', 'crear') : can('maestro_proveedores', 'editar')}
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

interface FormState {
  name: string;
  rfc: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentDays: number | '';
  active: boolean;
}

function seed(draft: Draft): FormState {
  if (draft === 'new' || draft === null) {
    return {
      name: '', rfc: '', contactName: '', phone: '', email: '', address: '',
      paymentDays: '', active: true,
    };
  }
  return {
    name: draft.name ?? '',
    rfc: draft.rfc ?? '',
    contactName: draft.contactName ?? '',
    phone: draft.phone ?? '',
    email: draft.email ?? '',
    address: draft.address ?? '',
    paymentDays: draft.paymentDays ?? '',
    active: draft.active,
  };
}

function SupplierDrawer({
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
  const [form, setForm] = useState<FormState>(() => seed(draft));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const rfcError = validateRfc(form.rfc);
  const nameError = isBlank(form.name) ? 'El nombre es obligatorio.' : null;
  const canSubmit = canEdit && !nameError && !rfcError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    const body: SupplierInput = {
      name: form.name.trim(),
      rfc: form.rfc.trim() ? form.rfc.trim().toUpperCase() : null,
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      paymentDays: form.paymentDays === '' ? 0 : form.paymentDays,
      active: form.active,
    };
    try {
      if (isNew) await createSupplier(body);
      else await updateSupplier((draft as SupplierRow).id, body);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo proveedor' : 'Editar proveedor'}
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
        <TextField
          label="Nombre / Razón social"
          name="name"
          value={form.name}
          onChange={(v) => set('name', v)}
          required
          error={nameError}
        />
        <div className="panel-form-grid">
          <TextField
            label="RFC"
            name="rfc"
            value={form.rfc}
            onChange={(v) => set('rfc', v)}
            error={rfcError}
            hint="Opcional. Formato SAT."
          />
          <NumberField
            label="Días de crédito"
            name="paymentDays"
            value={form.paymentDays}
            onChange={(v) => set('paymentDays', v)}
            min={0}
          />
        </div>
        <div className="panel-form-grid">
          <TextField
            label="Contacto"
            name="contactName"
            value={form.contactName}
            onChange={(v) => set('contactName', v)}
          />
          <TextField
            label="Teléfono"
            name="phone"
            value={form.phone}
            onChange={(v) => set('phone', v)}
            inputMode="tel"
          />
        </div>
        <TextField
          label="Correo"
          name="email"
          type="email"
          value={form.email}
          onChange={(v) => set('email', v)}
          inputMode="email"
        />
        <TextField
          label="Dirección"
          name="address"
          value={form.address}
          onChange={(v) => set('address', v)}
        />
        <CheckboxField
          label="Proveedor activo"
          name="active"
          checked={form.active}
          onChange={(v) => set('active', v)}
        />
      </fieldset>
    </Drawer>
  );
}
