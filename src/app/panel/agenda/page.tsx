'use client';

/**
 * Agenda (módulo `calendario`). Vista semanal (lunes→domingo) con filtro por
 * profesional. Cada día lista sus citas con hora, paciente, profesional y estado.
 * "Nueva cita" abre el drawer de alta; clic en una cita abre el detalle con
 * acciones de estado y reprogramar. El server manda; la UI sólo oculta.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AppointmentRow, ProfessionalRef } from '@/lib/types/erp-clinica';
import {
  listAppointmentsByRange,
  listProfessionals,
  APPT_STATUS_LABEL,
  apptStatusTone,
} from '../_lib/agenda';
import { useCan } from '../_components/session';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../_components/States';
import { NewAppointmentDrawer } from './_components/NewAppointmentDrawer';
import { AppointmentDetailDrawer } from './_components/AppointmentDetailDrawer';
import { startOfWeek, addDays, ymd, hhmm, DAY_FMT } from './_components/utils';

export default function AgendaPage() {
  const can = useCan();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [professionalId, setProfessionalId] = useState('');
  const [professionals, setProfessionals] = useState<ProfessionalRef[]>([]);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  // Profesionales (una vez) para el filtro y el alta.
  useEffect(() => {
    let alive = true;
    listProfessionals()
      .then((ps) => alive && setProfessionals(ps))
      .catch(() => alive && setProfessionals([]));
    return () => {
      alive = false;
    };
  }, []);

  // Citas del rango (se recarga al cambiar semana/profesional/refresh).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const from = new Date(weekStart);
    from.setHours(0, 0, 0, 0);
    const to = addDays(new Date(weekStart), 6);
    to.setHours(23, 59, 59, 999);
    listAppointmentsByRange(from.toISOString(), to.toISOString(), professionalId || undefined)
      .then((data) => alive && setRows(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Error al cargar la agenda.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [weekStart, professionalId, refresh]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const r of rows) {
      const key = ymd(new Date(r.startsAt));
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  const reload = () => setRefresh((n) => n + 1);

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Agenda</h2>
          <p className="panel-page-sub">Citas por semana. Confirma, completa o reprograma.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
          <Link className="pbtn pbtn--ghost" href="/panel/agenda/series">
            Series
          </Link>
          {can('calendario', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setNewOpen(true)}>
              + Nueva cita
            </button>
          ) : (
            <ReadOnlyBadge />
          )}
        </div>
      </div>

      {/* Controles de semana + filtro */}
      <div
        className="panel-toolbar"
        style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <button
          type="button"
          className="pbtn pbtn--ghost pbtn--sm"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
        >
          ← Semana anterior
        </button>
        <button
          type="button"
          className="pbtn pbtn--ghost pbtn--sm"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          Hoy
        </button>
        <button
          type="button"
          className="pbtn pbtn--ghost pbtn--sm"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
        >
          Semana siguiente →
        </button>
        <span className="panel-field-hint" style={{ marginInline: 'var(--sp-1)' }}>
          {DAY_FMT.format(weekStart)} – {DAY_FMT.format(weekEnd)}
        </span>
        <select
          className="panel-select"
          style={{ width: 'auto', marginLeft: 'auto' }}
          value={professionalId}
          onChange={(e) => setProfessionalId(e.target.value)}
          aria-label="Filtrar por profesional"
        >
          <option value="">Todos los profesionales</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner label="Cargando agenda…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="agenda-week">
          {days.map((day) => {
            const key = ymd(day);
            const items = (byDay.get(key) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            return (
              <div key={key} className="panel-card" style={{ padding: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700, textTransform: 'capitalize' }}>
                  {DAY_FMT.format(day)}
                </h3>
                {items.length === 0 ? (
                  <p className="panel-field-hint" style={{ margin: 0 }}>
                    Sin citas.
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--sp-1)' }}>
                    {items.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="agenda-appt"
                          onClick={() => setDetailId(r.id)}
                          style={{
                            display: 'flex',
                            gap: 'var(--sp-2)',
                            alignItems: 'center',
                            width: '100%',
                            textAlign: 'left',
                            padding: 'var(--sp-1) var(--sp-2)',
                            border: '1px solid var(--panel-border, #e5e7eb)',
                            borderRadius: 'var(--radius-sm, 6px)',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <strong style={{ minWidth: '5.5em' }}>
                            {hhmm(r.startsAt)}–{hhmm(r.endsAt)}
                          </strong>
                          <span style={{ flex: 1 }}>
                            {r.patientName ?? '—'}
                            {r.professionalName && (
                              <span className="panel-field-hint"> · {r.professionalName}</span>
                            )}
                            {r.resource && <span className="panel-field-hint"> · {r.resource}</span>}
                          </span>
                          <Badge tone={apptStatusTone(r.status)}>{APPT_STATUS_LABEL[r.status]}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NewAppointmentDrawer
        open={newOpen}
        professionals={professionals}
        defaultDate={weekStart}
        onClose={() => setNewOpen(false)}
        onCreated={reload}
      />
      <AppointmentDetailDrawer
        open={detailId != null}
        appointmentId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={reload}
      />
    </div>
  );
}
