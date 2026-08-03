'use client';

/**
 * Drawer para crear/editar una nota clínica. En alta permite ligarla
 * opcionalmente a una cita del historial del paciente. Recuerda al usuario que
 * la nota es CONFIDENCIAL (solo su autor y el dueño la verán). La UI sólo
 * refleja; la RLS de `clinical_notes` es la autoridad.
 */

import { useState } from 'react';
import { Drawer } from '@/app/panel/_components/Drawer';
import { SelectField } from '@/app/panel/_components/Field';
import type { HistorialItem } from '@/app/panel/_lib/expediente';

const DATETIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATETIME.format(d);
}

export function NoteDrawer({
  open,
  mode,
  initialBody = '',
  initialAppointmentId = null,
  historial = [],
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initialBody?: string;
  initialAppointmentId?: string | null;
  historial?: HistorialItem[];
  onClose: () => void;
  onSubmit: (body: string, appointmentId: string | null) => Promise<void>;
}) {
  const [body, setBody] = useState(initialBody);
  const [appointmentId, setAppointmentId] = useState<string>(initialAppointmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('La nota no puede estar vacía.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed, appointmentId || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la nota.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title={mode === 'create' ? 'Nueva nota clínica' : 'Editar nota clínica'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="pbtn pbtn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar nota'}
          </button>
        </>
      }
    >
      <p className="panel-field-hint" style={{ marginBottom: 'var(--sp-2)' }}>
        Confidencial: solo tú (autor) y el dueño de la clínica podrán ver esta nota.
      </p>

      {mode === 'create' && historial.length > 0 && (
        <SelectField
          label="Ligar a una cita (opcional)"
          name="appointmentId"
          value={appointmentId}
          onChange={setAppointmentId}
          placeholder="Sin cita asociada"
          options={historial.map((h) => ({ value: h.id, label: fmt(h.startsAt) }))}
        />
      )}

      <div className="panel-field">
        <label className="panel-field-label" htmlFor="note-body">
          Nota
          <span className="panel-field-req" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id="note-body"
          className="panel-input"
          rows={8}
          value={body}
          placeholder="Escribe la evolución, diagnóstico o indicaciones…"
          aria-required
          aria-invalid={error ? true : undefined}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && (
          <span className="panel-field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </Drawer>
  );
}
