'use client';

/**
 * Expediente clínico (módulo `expediente`). Se elige un paciente con el
 * CustomerPicker y se muestran su historial de citas y sus notas clínicas
 * confidenciales. La confidencialidad la hace cumplir la RLS de `clinical_notes`
 * (autor + dueño); esta UI sólo la refleja y la comunica.
 */

import { useState } from 'react';
import type { CustomerRow } from '@/lib/types/erp';
import { CustomerPicker } from '@/app/panel/_components/CustomerPicker';
import { EmptyState } from '@/app/panel/_components/States';
import { PatientExpediente } from './_components/PatientExpediente';

export default function ExpedientePage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);

  function onPick(id: string | null, row?: CustomerRow) {
    setCustomerId(id);
    setCustomerName(row?.name ?? null);
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Expediente clínico</h2>
          <p className="panel-page-sub">
            {customerName
              ? `Paciente: ${customerName}`
              : 'Busca un paciente para ver su historial y sus notas clínicas.'}
          </p>
        </div>
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <CustomerPicker value={customerId} onChange={onPick} label="Paciente" />
      </div>

      {customerId ? (
        <PatientExpediente key={customerId} customerId={customerId} />
      ) : (
        <EmptyState
          title="Selecciona un paciente"
          message="El historial de citas y las notas clínicas aparecerán aquí."
        />
      )}
    </div>
  );
}
