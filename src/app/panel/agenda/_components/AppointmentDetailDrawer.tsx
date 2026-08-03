'use client';

/**
 * Drawer de detalle de cita: datos + acciones de estado (Confirmar / Completar /
 * No asistió / Cancelar) y reprogramar (fecha/hora/duración). El server manda;
 * aquí sólo se ocultan acciones por permiso (useCan).
 */

import { useEffect, useState } from 'react';
import type { AppointmentDetail, AppointmentStatus } from '@/lib/types/erp-clinica';
import { ApiError } from '@/app/panel/_lib/api';
import {
  getAppointment,
  patchAppointment,
  setAppointmentEstado,
  APPT_STATUS_LABEL,
  apptStatusTone,
} from '@/app/panel/_lib/agenda';
import { useCan } from '@/app/panel/_components/session';
import { Drawer } from '@/app/panel/_components/Drawer';
import { TextField, NumberField } from '@/app/panel/_components/Field';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '@/app/panel/_components/States';
import { combineToISO, diffMinutes, hhmm, ymd, MXN } from './utils';

/** Acciones de estado ofrecidas según el estado actual. */
const NEXT_ACTIONS: Record<AppointmentStatus, { status: AppointmentStatus; label: string }[]> = {
  agendada: [
    { status: 'confirmada', label: 'Confirmar' },
    { status: 'no_asistio', label: 'No asistió' },
  ],
  confirmada: [
    { status: 'completada', label: 'Completar' },
    { status: 'no_asistio', label: 'No asistió' },
  ],
  completada: [],
  cancelada: [],
  no_asistio: [],
};

export function AppointmentDetailDrawer({
  open,
  appointmentId,
  onClose,
  onChanged,
}: {
  open: boolean;
  appointmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const can = useCan();
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estado del mini-form de reprogramar.
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [durationMin, setDurationMin] = useState<number | ''>(60);

  useEffect(() => {
    if (!open || !appointmentId) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    getAppointment(appointmentId)
      .then((d) => {
        if (!alive) return;
        setAppt(d);
        setDate(ymd(new Date(d.startsAt)));
        setTime(hhmm(d.startsAt));
        setDurationMin(diffMinutes(d.startsAt, d.endsAt));
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la cita.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, appointmentId]);

  async function runAction(fn: () => Promise<AppointmentDetail>) {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await fn();
      setAppt(updated);
      onChanged();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'La acción no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  function reprogram() {
    if (!appt) return;
    if (!date || !time) return setActionError('Indica fecha y hora.');
    const dur = typeof durationMin === 'number' ? durationMin : 0;
    if (dur <= 0) return setActionError('La duración debe ser mayor a 0.');
    const startsAt = combineToISO(date, time);
    const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString();
    runAction(() => patchAppointment(appt.id, { startsAt, endsAt }));
  }

  const canEdit = can('calendario', 'editar');
  const canCancel = can('calendario', 'cancelar');
  const isFinal =
    appt && ['completada', 'cancelada', 'no_asistio'].includes(appt.status);

  return (
    <Drawer open={open} title="Detalle de cita" onClose={onClose}>
      {loading && !appt ? (
        <Spinner label="Cargando cita…" />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : appt ? (
        <div>
          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <Badge tone={apptStatusTone(appt.status)}>{APPT_STATUS_LABEL[appt.status]}</Badge>
          </div>

          <Meta label="Paciente" value={appt.patientName ?? '—'} />
          <Meta label="Profesional" value={appt.professionalName ?? '—'} />
          <Meta
            label="Horario"
            value={`${new Date(appt.startsAt).toLocaleString('es-MX')} · ${diffMinutes(
              appt.startsAt,
              appt.endsAt,
            )} min`}
          />
          <Meta label="Recurso" value={appt.resource ?? '—'} />
          <Meta label="Precio" value={appt.priceMxn != null ? MXN.format(appt.priceMxn) : '—'} />
          {appt.notes && <Meta label="Notas" value={appt.notes} />}

          {actionError && (
            <p className="panel-field-error" role="alert" style={{ margin: 'var(--sp-2) 0' }}>
              {actionError}
            </p>
          )}

          {!canEdit && !canCancel && (
            <div style={{ marginTop: 'var(--sp-2)' }}>
              <ReadOnlyBadge />
            </div>
          )}

          {/* Acciones de estado */}
          {canEdit && NEXT_ACTIONS[appt.status].length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-1)',
                flexWrap: 'wrap',
                marginTop: 'var(--sp-3)',
              }}
            >
              {NEXT_ACTIONS[appt.status].map((a) => (
                <button
                  key={a.status}
                  type="button"
                  className="pbtn pbtn--primary"
                  disabled={busy}
                  onClick={() => runAction(() => setAppointmentEstado(appt.id, a.status))}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {canCancel && !isFinal && (
            <div style={{ marginTop: 'var(--sp-2)' }}>
              <button
                type="button"
                className="pbtn pbtn--danger"
                disabled={busy}
                onClick={() => runAction(() => setAppointmentEstado(appt.id, 'cancelada'))}
              >
                Cancelar cita
              </button>
            </div>
          )}

          {/* Reprogramar */}
          {canEdit && appt.status !== 'cancelada' && (
            <div style={{ marginTop: 'var(--sp-3)' }}>
              <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
                Reprogramar
              </h3>
              <TextField label="Fecha" name="rdate" type="date" value={date} onChange={setDate} />
              <TextField label="Hora" name="rtime" type="time" value={time} onChange={setTime} />
              <NumberField
                label="Duración (min)"
                name="rduration"
                value={durationMin}
                onChange={setDurationMin}
                min={5}
                step={5}
              />
              <button
                type="button"
                className="pbtn pbtn--primary"
                disabled={busy}
                onClick={reprogram}
              >
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </Drawer>
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
