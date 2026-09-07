'use client';

/**
 * Panel de Configuración (F4 · módulo core `config`). Pestañas: Maestros
 * (entrada a los catálogos, 0026), Permisos, Módulos, Folios, Branding,
 * Campos personalizados. Lectura gated por
 * `config/ver`; escritura por `config/configurar` (cada pestaña degrada a solo
 * lectura con <ReadOnlyBadge> si falta el permiso de escritura).
 */

import { useState } from 'react';
import { useCan } from '../_components/session';
import { EmptyState } from '../_components/States';
import { MaestrosTab } from './_components/MaestrosTab';
import { PermissionsTab } from './_components/PermissionsTab';
import { ModulesTab } from './_components/ModulesTab';
import { SeriesTab } from './_components/SeriesTab';
import { BrandingTab } from './_components/BrandingTab';
import { CustomFieldsTab } from './_components/CustomFieldsTab';

type TabKey = 'maestros' | 'permisos' | 'modulos' | 'folios' | 'branding' | 'campos';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'maestros', label: 'Maestros' },
  { key: 'permisos', label: 'Permisos' },
  { key: 'modulos', label: 'Módulos' },
  { key: 'folios', label: 'Folios' },
  { key: 'branding', label: 'Branding' },
  { key: 'campos', label: 'Campos personalizados' },
];

export default function ConfigPage() {
  const can = useCan();
  const canRead = can('config', 'ver');
  const canWrite = can('config', 'configurar');
  const [tab, setTab] = useState<TabKey>('maestros');

  if (!canRead) {
    return (
      <div>
        <div className="panel-page-head">
          <div>
            <h2 className="panel-page-title">Configuración</h2>
          </div>
        </div>
        <EmptyState
          title="Sin acceso"
          message="No tienes permiso para ver la configuración de esta organización."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Configuración</h2>
          <p className="panel-page-sub">Ajustes de la organización.</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de configuración"
        style={{
          display: 'flex',
          gap: 'var(--sp-1)',
          flexWrap: 'wrap',
          marginBottom: 'var(--sp-3)',
          borderBottom: '1px solid var(--panel-border, #e5e7eb)',
          paddingBottom: 'var(--sp-1)',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`pbtn ${tab === t.key ? 'pbtn--primary' : 'pbtn--ghost'} pbtn--sm`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'maestros' && <MaestrosTab />}
      {tab === 'permisos' && <PermissionsTab canWrite={canWrite} />}
      {tab === 'modulos' && <ModulesTab canWrite={canWrite} />}
      {tab === 'folios' && <SeriesTab canWrite={canWrite} />}
      {tab === 'branding' && <BrandingTab canWrite={canWrite} />}
      {tab === 'campos' && <CustomFieldsTab canWrite={canWrite} />}
    </div>
  );
}
