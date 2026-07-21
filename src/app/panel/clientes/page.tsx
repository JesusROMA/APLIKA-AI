'use client';

/**
 * Maestro de Clientes. Tabla paginada + drawer de alta/edición.
 * - Selects de Régimen fiscal y Uso CFDI desde GET /api/erp/catalogs.
 * - Validación de RFC/CP en cliente ADEMÁS del server (que es la autoridad).
 * - Botón "Nuevo" y guardado gated por perms (maestros.crear / maestros.editar).
 */

import { useMemo, useState } from 'react';
import type { CustomerRow } from '@/lib/types/erp';
import { listCustomers, createCustomer, updateCustomer, getCatalogs, listPriceLists } from '../_lib/api';
import { useAsyncData, usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Drawer } from '../_components/Drawer';
import { TextField, SelectField, NumberField, CheckboxField, type SelectOption } from '../_components/Field';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { validateRfc, validateCp, isBlank } from '../_lib/validation';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

type Draft = 'new' | CustomerRow | null;

export default function ClientesPage() {
  const can = useCan();
  const list = usePaginated<CustomerRow>(listCustomers);
  const catalogs = useAsyncData(getCatalogs);
  const priceLists = useAsyncData(() => listPriceLists({ pageSize: 100 }));
  const [draft, setDraft] = useState<Draft>(null);

  const regimenOpts: SelectOption[] = useMemo(
    () => (catalogs.data?.regimenFiscal ?? []).map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })),
    [catalogs.data],
  );
  const usoOpts: SelectOption[] = useMemo(
    () => (catalogs.data?.usoCfdi ?? []).map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })),
    [catalogs.data],
  );
  const priceListOpts: SelectOption[] = useMemo(
    () => (priceLists.data?.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    [priceLists.data],
  );

  const columns: Column<CustomerRow>[] = [
    { key: 'name', header: 'Nombre', render: (r) => <strong>{r.name}</strong> },
    { key: 'rfc', header: 'RFC', render: (r) => r.rfc ?? '—' },
    {
      key: 'contact',
      header: 'Contacto',
      render: (r) => r.contactName ?? r.phone ?? r.email ?? '—',
    },
    { key: 'priceList', header: 'Lista de precios', render: (r) => r.priceListName ?? '—' },
    {
      key: 'credit',
      header: 'Crédito',
      numeric: true,
      render: (r) => (r.creditLimit > 0 ? `${MXN.format(r.creditLimit)} · ${r.creditDays}d` : '—'),
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
          <h2 className="panel-page-title">Clientes</h2>
          <p className="panel-page-sub">Directorio de clientes y datos fiscales (CFDI 4.0).</p>
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
        searchPlaceholder="Buscar por nombre o RFC…"
        emptyTitle="Sin clientes"
        emptyMessage="Aún no has registrado clientes."
        toolbarActions={
          can('maestros', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
              + Nuevo cliente
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {draft !== null && (
        <CustomerDrawer
          draft={draft}
          regimenOpts={regimenOpts}
          usoOpts={usoOpts}
          priceListOpts={priceListOpts}
          canEdit={draft === 'new' ? can('maestros', 'crear') : can('maestros', 'editar')}
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
  regimenCode: string;
  usoCfdiCode: string;
  cp: string;
  contactName: string;
  phone: string;
  email: string;
  priceListId: string;
  creditLimit: number | '';
  creditDays: number | '';
  active: boolean;
}

function seed(draft: Draft): FormState {
  if (draft === 'new' || draft === null) {
    return {
      name: '', rfc: '', regimenCode: '', usoCfdiCode: '', cp: '', contactName: '',
      phone: '', email: '', priceListId: '', creditLimit: '', creditDays: '', active: true,
    };
  }
  return {
    name: draft.name ?? '',
    rfc: draft.rfc ?? '',
    regimenCode: draft.regimenCode ?? '',
    usoCfdiCode: draft.usoCfdiCode ?? '',
    cp: draft.cp ?? '',
    contactName: draft.contactName ?? '',
    phone: draft.phone ?? '',
    email: draft.email ?? '',
    priceListId: draft.priceListId ?? '',
    creditLimit: draft.creditLimit ?? '',
    creditDays: draft.creditDays ?? '',
    active: draft.active,
  };
}

function CustomerDrawer({
  draft,
  regimenOpts,
  usoOpts,
  priceListOpts,
  canEdit,
  onClose,
  onSaved,
}: {
  draft: Draft;
  regimenOpts: SelectOption[];
  usoOpts: SelectOption[];
  priceListOpts: SelectOption[];
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
  const cpError = validateCp(form.cp);
  const nameError = isBlank(form.name) ? 'El nombre es obligatorio.' : null;
  const canSubmit = canEdit && !nameError && !rfcError && !cpError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    const body: Partial<CustomerRow> = {
      name: form.name.trim(),
      rfc: form.rfc.trim() ? form.rfc.trim().toUpperCase() : null,
      regimenCode: form.regimenCode || null,
      usoCfdiCode: form.usoCfdiCode || null,
      cp: form.cp.trim() || null,
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      priceListId: form.priceListId || null,
      creditLimit: form.creditLimit === '' ? 0 : form.creditLimit,
      creditDays: form.creditDays === '' ? 0 : form.creditDays,
      active: form.active,
    };
    try {
      if (isNew) await createCustomer(body);
      else await updateCustomer((draft as CustomerRow).id, body);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo cliente' : 'Editar cliente'}
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
          <TextField
            label="CP (domicilio fiscal)"
            name="cp"
            value={form.cp}
            onChange={(v) => set('cp', v)}
            error={cpError}
            inputMode="numeric"
          />
        </div>
        <div className="panel-form-grid">
          <SelectField
            label="Régimen fiscal"
            name="regimenCode"
            value={form.regimenCode}
            onChange={(v) => set('regimenCode', v)}
            options={regimenOpts}
          />
          <SelectField
            label="Uso CFDI"
            name="usoCfdiCode"
            value={form.usoCfdiCode}
            onChange={(v) => set('usoCfdiCode', v)}
            options={usoOpts}
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
        <SelectField
          label="Lista de precios"
          name="priceListId"
          value={form.priceListId}
          onChange={(v) => set('priceListId', v)}
          options={priceListOpts}
          placeholder="Precio base (sin lista)"
        />
        <div className="panel-form-grid">
          <NumberField
            label="Límite de crédito (MXN)"
            name="creditLimit"
            value={form.creditLimit}
            onChange={(v) => set('creditLimit', v)}
            min={0}
          />
          <NumberField
            label="Días de crédito"
            name="creditDays"
            value={form.creditDays}
            onChange={(v) => set('creditDays', v)}
            min={0}
          />
        </div>
        <CheckboxField
          label="Cliente activo"
          name="active"
          checked={form.active}
          onChange={(v) => set('active', v)}
        />
      </fieldset>
    </Drawer>
  );
}
