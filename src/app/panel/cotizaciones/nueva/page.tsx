'use client';

/**
 * Alta de cotización (F1 · Tanda B). Reúsa <QuoteForm> y, al guardar (POST),
 * navega al detalle de la cotización creada. Gated por cotizaciones/crear.
 */

import { useRouter } from 'next/navigation';
import { createQuote } from '../../_lib/cotizaciones';
import { useCan } from '../../_components/session';
import { QuoteForm } from '../_components/QuoteForm';

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('cotizaciones', 'crear');

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva cotización</h2>
          <p className="panel-page-sub">Crea una propuesta en borrador.</p>
        </div>
      </div>

      <QuoteForm
        canEdit={canCreate}
        submitLabel="Crear cotización"
        onSubmit={async (body) => {
          const { id } = await createQuote(body);
          router.push(`/panel/cotizaciones/${id}`);
        }}
        onCancel={() => router.push('/panel/cotizaciones')}
      />
    </div>
  );
}
