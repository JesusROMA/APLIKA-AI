'use client';

/**
 * Expediente de un paciente: historial de citas + notas clínicas confidenciales.
 * Se remonta por paciente (via `key`), así useAsyncData recarga al cambiar de
 * paciente. La visibilidad de notas la decide la RLS; aquí sólo mostramos lo que
 * el server devuelve y ofrecemos "Editar" en las notas del propio autor.
 */

import { useState } from 'react';
import type { ModuleKey } from '@/lib/types/erp';
import type { AppointmentStatus, ClinicalNoteRow } from '@/lib/types/erp-clinica';
import { useAsyncData } from '@/app/panel/_lib/hooks';
import { useCan, useSession } from '@/app/panel/_components/session';
import { Spinner, ErrorState, EmptyState, Badge, ReadOnlyBadge } from '@/app/panel/_components/States';
import * as api from '@/app/panel/_lib/expediente';
import { NoteDrawer } from './NoteDrawer';

const EXPEDIENTE: ModuleKey = 'expediente';

const DATETIME = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATETIME.format(d);
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

function statusTone(status: AppointmentStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada' || status === 'no_asistio') return 'ro';
  if (status === 'completada') return 'on';
  if (status === 'confirmada') return 'blue';
  return 'off';
}

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; note: ClinicalNoteRow };

export function PatientExpediente({ customerId }: { customerId: string }) {
  const can = useCan();
  const session = useSession();
  const canCreate = can(EXPEDIENTE, 'crear');
  const canEdit = can(EXPEDIENTE, 'editar');

  const historial = useAsyncData(() => api.historial(customerId));
  const notes = useAsyncData(() => api.listByPatient(customerId));

  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'closed' });

  async function submitNote(body: string, appointmentId: string | null) {
    if (drawer.mode === 'edit') {
      await api.update(drawer.note.id, body);
    } else {
      await api.create({ customerId, appointmentId, body });
    }
    setDrawer({ mode: 'closed' });
    notes.reload();
  }

  return (
    <div>
      {/* Historial de citas */}
      <section className="panel-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Historial de citas
        </h3>
        {historial.loading ? (
          <Spinner label="Cargando historial…" />
        ) : historial.error ? (
          <ErrorState message={historial.error} onRetry={historial.reload} />
        ) : !historial.data || historial.data.length === 0 ? (
          <EmptyState title="Sin citas" message="Este paciente no tiene citas registradas." />
        ) : (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Profesional</th>
                </tr>
              </thead>
              <tbody>
                {historial.data.map((h) => (
                  <tr key={h.id}>
                    <td>{fmt(h.startsAt)}</td>
                    <td>
                      <Badge tone={statusTone(h.status)}>{STATUS_LABEL[h.status]}</Badge>
                    </td>
                    <td>{h.professionalName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notas clínicas */}
      <section className="panel-card" style={{ padding: 'var(--sp-3)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            marginBottom: 'var(--sp-1)',
          }}
        >
          <h3 className="panel-page-sub" style={{ margin: 0, fontWeight: 700 }}>
            Notas clínicas
          </h3>
          {canCreate ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => setDrawer({ mode: 'create' })}
            >
              Nueva nota
            </button>
          ) : (
            <ReadOnlyBadge />
          )}
        </div>
        <p className="panel-field-hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
          Confidencial: cada nota solo es visible para su autor y para el dueño de la clínica.
        </p>

        {notes.loading ? (
          <Spinner label="Cargando notas…" />
        ) : notes.error ? (
          <ErrorState message={notes.error} onRetry={notes.reload} />
        ) : !notes.data || notes.data.length === 0 ? (
          <EmptyState
            title="Sin notas"
            message="No hay notas clínicas visibles para ti sobre este paciente."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {notes.data.map((n) => {
              const mine = n.professionalId === session.userId;
              return (
                <li
                  key={n.id}
                  className="panel-card"
                  style={{ padding: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 'var(--sp-2)',
                    }}
                  >
                    <div>
                      <strong>{n.professionalName ?? 'Autor'}</strong>{' '}
                      <span className="panel-field-hint">{fmt(n.createdAt)}</span>
                    </div>
                    {mine && canEdit && (
                      <button
                        type="button"
                        className="pbtn pbtn--ghost pbtn--sm"
                        onClick={() => setDrawer({ mode: 'edit', note: n })}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {drawer.mode !== 'closed' && (
        <NoteDrawer
          open
          mode={drawer.mode}
          initialBody={drawer.mode === 'edit' ? drawer.note.body : ''}
          initialAppointmentId={drawer.mode === 'edit' ? drawer.note.appointmentId : null}
          historial={historial.data ?? []}
          onClose={() => setDrawer({ mode: 'closed' })}
          onSubmit={submitNote}
        />
      )}
    </div>
  );
}
