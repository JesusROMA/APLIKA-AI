'use client';

/**
 * Drawer de alta/edición de prospecto. Permite editar campos, cambiar la etapa
 * (embudo) y convertir a cliente. Escritura gated por crm/crear (alta y
 * conversión) y crm/editar (edición). El servidor es la autoridad.
 */

import { useState } from 'react';
import type { ProspectRow, ProspectInput, ProspectStage } from '@/lib/types/erp-crm';
import {
  createProspect,
  updateProspect,
  convertProspect,
  PROSPECT_STAGES,
  PROSPECT_STAGE_LABEL,
  prospectStageTone,
} from '../../_lib/crm';
import { Drawer } from '../../_components/Drawer';
import { TextField, SelectField, type SelectOption } from '../../_components/Field';
import { Badge, ReadOnlyBadge } from '../../_components/States';

export type ProspectDraft = 'new' | ProspectRow;

interface FormState {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  source: string;
  stage: ProspectStage;
  notas: string;
}

function seed(draft: ProspectDraft): FormState {
  if (draft === 'new') {
    return { name: '', contactName: '', phone: '', email: '', source: '', stage: 'nuevo', notas: '' };
  }
  return {
    name: draft.name ?? '',
    contactName: draft.contactName ?? '',
    phone: draft.phone ?? '',
    email: draft.email ?? '',
    source: draft.source ?? '',
    stage: draft.stage,
    notas: draft.notas ?? '',
  };
}

const STAGE_OPTS: SelectOption[] = PROSPECT_STAGES.map((s) => ({
  value: s,
  label: PROSPECT_STAGE_LABEL[s],
}));

export function ProspectDrawer({
  draft,
  canCreate,
  canEdit,
  onClose,
  onSaved,
  onConverted,
}: {
  draft: ProspectDraft;
  canCreate: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onConverted: (customerId: string) => void;
}) {
  const isNew = draft === 'new';
  const canWrite = isNew ? canCreate : canEdit;
  const [form, setForm] = useState<FormState>(() => seed(draft));
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const alreadyCustomer = !isNew && Boolean((draft as ProspectRow).customerId);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const nameError = form.name.trim() === '' ? 'El nombre es obligatorio.' : null;
  const canSubmit = canWrite && !nameError && !saving && !converting;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    const body: ProspectInput = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      source: form.source.trim() || null,
      stage: form.stage,
      notas: form.notas.trim() || null,
    };
    try {
      if (isNew) await createProspect(body);
      else await updateProspect((draft as ProspectRow).id, body);
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setSaving(false);
    }
  };

  const convert = async () => {
    if (isNew || !canCreate || converting || saving) return;
    setConverting(true);
    setServerError(null);
    try {
      const res = await convertProspect((draft as ProspectRow).id);
      onConverted(res.customerId);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo convertir.');
      setConverting(false);
    }
  };

  return (
    <Drawer
      open
      title={isNew ? 'Nuevo prospecto' : form.name || 'Prospecto'}
      onClose={onClose}
      footer={
        <>
          {!canWrite && <ReadOnlyBadge />}
          {!isNew && canCreate && !alreadyCustomer && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              disabled={converting || saving}
              onClick={convert}
            >
              {converting ? 'Convirtiendo…' : 'Convertir a cliente'}
            </button>
          )}
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

      {!isNew && (
        <div className="panel-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span className="panel-field-label" style={{ margin: 0 }}>Etapa actual</span>
          <Badge tone={prospectStageTone(form.stage)}>{PROSPECT_STAGE_LABEL[form.stage]}</Badge>
          {alreadyCustomer && <Badge tone="on">Convertido a cliente</Badge>}
        </div>
      )}

      <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0 }}>
        <TextField
          label="Nombre / Empresa"
          name="name"
          value={form.name}
          onChange={(v) => set('name', v)}
          required
          error={nameError}
        />
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
        <div className="panel-form-grid">
          <TextField
            label="Correo"
            name="email"
            type="email"
            value={form.email}
            onChange={(v) => set('email', v)}
            inputMode="email"
          />
          <TextField
            label="Origen"
            name="source"
            value={form.source}
            onChange={(v) => set('source', v)}
            hint="Cómo llegó el prospecto."
          />
        </div>
        <SelectField
          label="Etapa"
          name="stage"
          value={form.stage}
          onChange={(v) => set('stage', v as ProspectStage)}
          options={STAGE_OPTS}
          placeholder=""
        />
        <div className="panel-field">
          <label className="panel-field-label" htmlFor="prospect-notas">
            Notas
          </label>
          <textarea
            id="prospect-notas"
            name="notas"
            className="panel-textarea"
            rows={4}
            value={form.notas}
            onChange={(e) => set('notas', e.target.value)}
          />
        </div>
      </fieldset>
    </Drawer>
  );
}
