'use client';

/**
 * Catch-all del panel. El nav es dinámico (session.modules): un módulo
 * operativo activo puede apuntar a una ruta que TODAVÍA no tiene página en F0
 * (se construirán en fases siguientes). En vez de un 404 crudo, mostramos un
 * estado "en construcción". Las rutas reales (clientes/productos/almacenes/
 * listas-precios y el índice /panel) tienen prioridad sobre este catch-all.
 */

import { EmptyState } from '../_components/States';

export default function PanelCatchAll() {
  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Módulo en construcción</h2>
          <p className="panel-page-sub">Esta sección estará disponible en una fase próxima.</p>
        </div>
      </div>
      <div className="panel-card">
        <EmptyState
          title="Próximamente"
          message="Este módulo aparece en tu menú porque está activo, pero su pantalla aún no forma parte de la Fase 0."
        />
      </div>
    </div>
  );
}
