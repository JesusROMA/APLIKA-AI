'use client';

/**
 * CRM (F7 · Tanda B — AGENTE-CRM). Dos pestañas:
 *  - Clientes 360: tabla de clientes con saldo; al abrir, historial de
 *    documentos (cotizaciones/pedidos/facturas) + saldo por cobrar.
 *  - Prospectos: listado paginado con filtro por etapa; alta, edición, cambio
 *    de etapa y conversión a cliente. Acciones gated por perms (crm/*).
 */

import { useEffect, useState } from 'react';
import type { CustomerRow, Paginated } from '@/lib/types/erp';
import type { ProspectRow, ProspectStage } from '@/lib/types/erp-crm';
import { listCustomers } from '../_lib/api';
import {
  listProspects,
  PROSPECT_STAGES,
  PROSPECT_STAGE_LABEL,
  prospectStageTone,
} from '../_lib/crm';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { CustomerHistoryDrawer } from './_components/CustomerHistoryDrawer';
import { ProspectDrawer, type ProspectDraft } from './_components/ProspectDrawer';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

type Tab = 'clientes' | 'prospectos';

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>('clientes');

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">CRM</h2>
          <p className="panel-page-sub">Vista 360 de clientes y embudo de prospectos.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones de CRM" style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-3)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clientes'}
          className={`pbtn ${tab === 'clientes' ? 'pbtn--primary' : 'pbtn--ghost'}`}
          onClick={() => setTab('clientes')}
        >
          Clientes 360
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prospectos'}
          className={`pbtn ${tab === 'prospectos' ? 'pbtn--primary' : 'pbtn--ghost'}`}
          onClick={() => setTab('prospectos')}
        >
          Prospectos
        </button>
      </div>

      {tab === 'clientes' ? <ClientesTab /> : <ProspectosTab />}
    </div>
  );
}

// ===== Pestaña Clientes 360 =====

function ClientesTab() {
  const list = usePaginated<CustomerRow>(listCustomers);
  const [selected, setSelected] = useState<CustomerRow | null>(null);

  const columns: Column<CustomerRow>[] = [
    { key: 'name', header: 'Cliente', render: (r) => <strong>{r.name}</strong> },
    {
      key: 'contact',
      header: 'Contacto',
      render: (r) => r.contactName ?? r.phone ?? r.email ?? '—',
    },
    { key: 'phone', header: 'Teléfono', render: (r) => r.phone ?? '—' },
    {
      key: 'balance',
      header: 'Saldo (CxC)',
      numeric: true,
      render: (r) => MXN.format(r.balance),
    },
  ];

  return (
    <>
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
        onRowClick={(r) => setSelected(r)}
        searchPlaceholder="Buscar cliente…"
        emptyTitle="Sin clientes"
        emptyMessage="Aún no hay clientes registrados."
      />

      {selected && (
        <CustomerHistoryDrawer customer={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

// ===== Pestaña Prospectos =====

function ProspectosTab() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<ProspectStage | ''>('');
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Paginated<ProspectRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProspectDraft | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listProspects({ page, pageSize, search, status: stage || undefined })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, pageSize, search, stage, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const columns: Column<ProspectRow>[] = [
    { key: 'name', header: 'Prospecto', render: (r) => <strong>{r.name}</strong> },
    {
      key: 'contact',
      header: 'Contacto',
      render: (r) => r.contactName ?? r.phone ?? r.email ?? '—',
    },
    {
      key: 'stage',
      header: 'Etapa',
      render: (r) => (
        <Badge tone={prospectStageTone(r.stage)}>{PROSPECT_STAGE_LABEL[r.stage]}</Badge>
      ),
    },
    { key: 'source', header: 'Origen', render: (r) => r.source ?? '—' },
    {
      key: 'converted',
      header: 'Cliente',
      render: (r) => (r.customerId ? <Badge tone="on">Sí</Badge> : '—'),
    },
    { key: 'createdAt', header: 'Alta', render: (r) => DATE.format(new Date(r.createdAt)) },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => setDraft(r)}
        searchPlaceholder="Buscar prospecto…"
        emptyTitle="Sin prospectos"
        emptyMessage="Aún no hay prospectos en el embudo."
        toolbarActions={
          <>
            <select
              className="panel-select"
              aria-label="Filtrar por etapa"
              value={stage}
              onChange={(e) => {
                setStage(e.target.value as ProspectStage | '');
                setPage(1);
              }}
            >
              <option value="">Todas las etapas</option>
              {PROSPECT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PROSPECT_STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            {can('crm', 'crear') ? (
              <button type="button" className="pbtn pbtn--primary" onClick={() => setDraft('new')}>
                + Nuevo prospecto
              </button>
            ) : (
              <ReadOnlyBadge />
            )}
          </>
        }
      />

      {draft !== null && (
        <ProspectDrawer
          draft={draft}
          canCreate={can('crm', 'crear')}
          canEdit={can('crm', 'editar')}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
          onConverted={() => {
            setDraft(null);
            reload();
          }}
        />
      )}
    </>
  );
}
