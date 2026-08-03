'use client';

/**
 * Series de recurrencia (módulo `calendario`). Lista paginada de series con
 * "Nueva serie" (drawer) y "Generar citas" por fila (RPC generar_serie, muestra
 * cuántas se crearon). El server manda; la UI sólo oculta por permiso.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { SeriesRow, ProfessionalRef } from '@/lib/types/erp-clinica';
import { ApiError } from '../../_lib/api';
import {
  listSeries,
  createSeries,
  generarSerie,
  listProfessionals,
  FREQ_LABEL,
  WEEKDAY_LABEL,
} from '../../_lib/agenda';
import { usePaginated, useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DataTable, type Column } from '../../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../../_components/States';
import { CustomerPicker } from '../../_components/CustomerPicker';
import { Drawer } from '../../_components/Drawer';
import { TextField, NumberField, SelectField } from '../../_components/Field';
import { MXN } from '../_components/utils';

const WEEKDAY_OPTIONS = WEEKDAY_LABEL.map((label, value) => ({ value: String(value), label }));
const FREQ_OPTIONS = (Object.keys(FREQ_LABEL) as (keyof typeof FREQ_LABEL)[]).map((k) => ({
  value: k,
  label: FREQ_LABEL[k],
}));

export default function SeriesPage() {
  const can = useCan();
  const list = usePaginated<SeriesRow>(listSeries);
  const { data: professionals } = useAsyncData<ProfessionalRef[]>(listProfessionals);

  const [newOpen, setNewOpen] = useState(false);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generar(id: string) {
    setGenBusy(id);
    setNotice(null);
    try {
      const { creadas } = await generarSerie(id);
      setNotice(`Se generaron ${creadas} cita(s) de la serie.`);
      list.reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'No se pudieron generar las citas.');
    } finally {
      setGenBusy(null);
    }
  }

  const columns: Column<SeriesRow>[] = [
    { key: 'professional', header: 'Profesional', render: (r) => r.professionalName ?? '—' },
    { key: 'patient', header: 'Paciente', render: (r) => r.patientName ?? '—' },
    { key: 'freq', header: 'Frecuencia', render: (r) => FREQ_LABEL[r.freq] },
    {
      key: 'when',
      header: 'Día / hora',
      render: (r) => `${WEEKDAY_LABEL[r.weekday]} ${r.startTime} (${r.durationMin}m)`,
    },
    { key: 'until', header: 'Hasta', render: (r) => r.until },
    { key: 'price', header: 'Precio', numeric: true, render: (r) => (r.priceMxn != null ? MXN.format(r.priceMxn) : '—') },
    {
      key: 'active',
      header: 'Estado',
      render: (r) => <Badge tone={r.active ? 'on' : 'off'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        can('calendario', 'crear') ? (
          <button
            type="button"
            className="pbtn pbtn--ghost pbtn--sm"
            disabled={genBusy === r.id}
            onClick={() => generar(r.id)}
          >
            {genBusy === r.id ? 'Generando…' : 'Generar citas'}
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Series de citas</h2>
          <p className="panel-page-sub">Recurrencias que generan citas automáticamente.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
          <Link className="pbtn pbtn--ghost" href="/panel/agenda">
            ← Agenda
          </Link>
          {can('calendario', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setNewOpen(true)}>
              + Nueva serie
            </button>
          ) : (
            <ReadOnlyBadge />
          )}
        </div>
      </div>

      {notice && (
        <p className="panel-field-hint" role="status" style={{ marginBottom: 'var(--sp-2)' }}>
          {notice}
        </p>
      )}

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
        emptyTitle="Sin series"
        emptyMessage="Aún no has creado series de citas."
      />

      <NewSeriesDrawer
        open={newOpen}
        professionals={professionals ?? []}
        onClose={() => setNewOpen(false)}
        onCreated={list.reload}
      />
    </div>
  );
}

function NewSeriesDrawer({
  open,
  professionals,
  onClose,
  onCreated,
}: {
  open: boolean;
  professionals: ProfessionalRef[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [freq, setFreq] = useState<'semanal' | 'quincenal' | 'mensual'>('semanal');
  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('09:00');
  const [durationMin, setDurationMin] = useState<number | ''>(60);
  const [until, setUntil] = useState('');
  const [resource, setResource] = useState('');
  const [priceMxn, setPriceMxn] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!professionalId) return setError('Selecciona un profesional.');
    if (!until) return setError('Indica la fecha límite (hasta).');
    const dur = typeof durationMin === 'number' ? durationMin : 60;

    setBusy(true);
    try {
      await createSeries({
        professionalId,
        customerId: customerId ?? undefined,
        patientName: patientName.trim() || undefined,
        freq,
        weekday: Number(weekday),
        startTime,
        durationMin: dur,
        until,
        resource: resource.trim() || undefined,
        priceMxn: priceMxn === '' ? undefined : priceMxn,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la serie.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="Nueva serie"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="pbtn pbtn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Guardando…' : 'Crear serie'}
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
      />
      <SelectField
        label="Profesional"
        name="professionalId"
        value={professionalId}
        onChange={setProfessionalId}
        required
        options={professionals.map((p) => ({ value: p.id, label: p.name }))}
      />
      <SelectField
        label="Frecuencia"
        name="freq"
        value={freq}
        onChange={(v) => setFreq(v as 'semanal' | 'quincenal' | 'mensual')}
        options={FREQ_OPTIONS}
      />
      <SelectField
        label="Día de la semana"
        name="weekday"
        value={weekday}
        onChange={setWeekday}
        options={WEEKDAY_OPTIONS}
      />
      <TextField label="Hora" name="startTime" type="time" value={startTime} onChange={setStartTime} required />
      <NumberField label="Duración (min)" name="durationMin" value={durationMin} onChange={setDurationMin} min={5} step={5} />
      <TextField label="Hasta" name="until" type="date" value={until} onChange={setUntil} required />
      <TextField label="Recurso / consultorio" name="resource" value={resource} onChange={setResource} />
      <NumberField label="Precio (MXN)" name="priceMxn" value={priceMxn} onChange={setPriceMxn} min={0} step={1} />
    </Drawer>
  );
}
