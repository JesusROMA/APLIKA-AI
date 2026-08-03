'use client';

/**
 * Drawer de alta de cita. Paciente (CustomerPicker o nombre libre) + profesional
 * + fecha/hora inicio + duración → POST /appointments. Muestra el 409 de empalme.
 */

import { useState } from 'react';
import type { ProfessionalRef } from '@/lib/types/erp-clinica';
import { ApiError } from '@/app/panel/_lib/api';
import { createAppointment } from '@/app/panel/_lib/agenda';
import { CustomerPicker } from '@/app/panel/_components/CustomerPicker';
import { Drawer } from '@/app/panel/_components/Drawer';
import { TextField, NumberField, SelectField } from '@/app/panel/_components/Field';
import { combineToISO, ymd } from './utils';

export function NewAppointmentDrawer({
  open,
  professionals,
  defaultDate,
  onClose,
  onCreated,
}: {
  open: boolean;
  professionals: ProfessionalRef[];
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(ymd(defaultDate));
  const [time, setTime] = useState('09:00');
  const [durationMin, setDurationMin] = useState<number | ''>(60);
  const [resource, setResource] = useState('');
  const [priceMxn, setPriceMxn] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCustomerId(null);
    setPatientName('');
    setProfessionalId('');
    setTime('09:00');
    setDurationMin(60);
    setResource('');
    setPriceMxn('');
    setNotes('');
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!professionalId) return setError('Selecciona un profesional.');
    if (!customerId && !patientName.trim()) {
      return setError('Selecciona un paciente o escribe su nombre.');
    }
    if (!date || !time) return setError('Indica fecha y hora.');
    const dur = typeof durationMin === 'number' ? durationMin : 0;
    if (dur <= 0) return setError('La duración debe ser mayor a 0.');

    const startsAt = combineToISO(date, time);
    const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString();

    setBusy(true);
    try {
      await createAppointment({
        professionalId,
        customerId: customerId ?? undefined,
        patientName: patientName.trim() || undefined,
        startsAt,
        endsAt,
        resource: resource.trim() || undefined,
        priceMxn: priceMxn === '' ? undefined : priceMxn,
        notes: notes.trim() || undefined,
      });
      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la cita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="Nueva cita"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="pbtn pbtn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Guardando…' : 'Crear cita'}
          </button>
        </div>
      }
    >
      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <CustomerPicker value={customerId} onChange={(id) => setCustomerId(id)} label="Paciente" />
      <TextField
        label="Nombre del paciente (si no está en clientes)"
        name="patientName"
        value={patientName}
        onChange={setPatientName}
        placeholder="Opcional si eliges un cliente"
      />
      <SelectField
        label="Profesional"
        name="professionalId"
        value={professionalId}
        onChange={setProfessionalId}
        required
        options={professionals.map((p) => ({ value: p.id, label: p.name }))}
      />
      <TextField label="Fecha" name="date" type="date" value={date} onChange={setDate} required />
      <TextField label="Hora de inicio" name="time" type="time" value={time} onChange={setTime} required />
      <NumberField
        label="Duración (min)"
        name="durationMin"
        value={durationMin}
        onChange={setDurationMin}
        min={5}
        step={5}
        required
      />
      <TextField label="Recurso / consultorio" name="resource" value={resource} onChange={setResource} />
      <NumberField label="Precio (MXN)" name="priceMxn" value={priceMxn} onChange={setPriceMxn} min={0} step={1} />
      <TextField label="Notas" name="notes" value={notes} onChange={setNotes} />
    </Drawer>
  );
}
